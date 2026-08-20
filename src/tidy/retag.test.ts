import { describe, expect, it } from "vitest";
import type { Page, PageManifestEntry } from "../domain/page";
import { buildRetagPrompt, estimateRetagUsd, needsRetag, parseRetagProposal, proposeRetag, RETAG_BUDGET_USD, runRetag } from "./retag";

const page = (id: string, overrides: Partial<Page> = {}): Page => ({
  id,
  title: id,
  area: "notes",
  tags: ["Educational Psychology", "Note"],
  body: "Original body.",
  connected: [],
  attachments: [],
  source: "hub",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

const entry = (id: string, overrides: Partial<PageManifestEntry> = {}): PageManifestEntry => ({
  id,
  title: id,
  area: "notes",
  tags: ["Educational Psychology"],
  excerpt: "Original body.",
  ...overrides,
});

describe("needsRetag", () => {
  it("skips pages whose topic tags are already only on the closed list", () => {
    expect(needsRetag(["Note", "EDST5805", "Philosophy Knowledge and Society"])).toBe(false);
    expect(needsRetag(["Educational Psychology", "Note"])).toBe(true);
    expect(needsRetag(["Note"])).toBe(true);
  });
});

describe("parseRetagProposal", () => {
  it("accepts closed-list tags and rejects empty, unknown-only, and garbage replies", () => {
    expect(parseRetagProposal('{"tags":["Philosophy Knowledge and Society"]}')).toEqual(["Philosophy Knowledge and Society"]);
    expect(parseRetagProposal('Sure.\n```json\n{"tags":["learning science and cognition"]}\n```')).toEqual([
      "Learning Science and Cognition",
    ]);
    expect(parseRetagProposal('{"tags":[]}')).toBeNull();
    expect(parseRetagProposal('{"tags":["History"]}')).toBeNull();
    expect(parseRetagProposal("not JSON")).toBeNull();
  });
});

describe("estimateRetagUsd", () => {
  it("prices Haiku input and output per million tokens", () => {
    expect(estimateRetagUsd(1_000_000, 1_000_000)).toBe(6);
    expect(RETAG_BUDGET_USD).toBe(10);
  });
});

describe("runRetag", () => {
  it("applies proposed tags, keeps structural tags, updates the manifest, and leaves the body alone", async () => {
    const writes: Page[] = [];
    let manifest: PageManifestEntry[] = [entry("p", { tags: ["Note", "Educational Psychology"] })];
    const result = await runRetag({
      readManifest: async () => manifest,
      readPage: async () => page("p", { tags: ["Note", "EDST5805", "Educational Psychology"] }),
      writePage: async next => {
        writes.push(next);
      },
      writeManifest: async entries => {
        manifest = entries;
      },
      propose: async () => ({ tags: ["Philosophy Knowledge and Society"], usage: { input_tokens: 200, output_tokens: 20 } }),
      now: () => "2026-08-20T00:00:00.000Z",
    });
    expect(writes[0]).toMatchObject({
      tags: ["Note", "EDST5805", "Philosophy Knowledge and Society"],
      body: "Original body.",
      updated_at: "2026-08-20T00:00:00.000Z",
    });
    expect(manifest[0].tags).toEqual(["Note", "EDST5805", "Philosophy Knowledge and Society"]);
    expect(result).toMatchObject({ changed: ["p"], skipped: [], errors: [] });
  });

  it("skips pages already on the closed list and does not call the model", async () => {
    let calls = 0;
    const writes: Page[] = [];
    const result = await runRetag({
      readManifest: async () => [entry("p", { tags: ["Philosophy Knowledge and Society"] })],
      readPage: async () => page("p", { tags: ["Philosophy Knowledge and Society"] }),
      writePage: async next => {
        writes.push(next);
      },
      writeManifest: async () => {},
      propose: async () => {
        calls += 1;
        return { tags: ["Learning Science and Cognition"], usage: { input_tokens: 200, output_tokens: 20 } };
      },
      now: () => "2026-08-20T00:00:00.000Z",
    });
    expect(calls).toBe(0);
    expect(writes).toEqual([]);
    expect(result.skipped).toEqual(["p"]);
  });

  it("retries an invalid proposal once, then leaves the page unchanged", async () => {
    const attempts: number[] = [];
    const writes: Page[] = [];
    const result = await runRetag({
      readManifest: async () => [entry("p")],
      readPage: async () => page("p"),
      writePage: async next => {
        writes.push(next);
      },
      writeManifest: async () => {},
      propose: async () => {
        attempts.push(1);
        return null;
      },
      now: () => "2026-08-20T00:00:00.000Z",
    });
    expect(attempts).toHaveLength(2);
    expect(writes).toEqual([]);
    expect(result.errors).toEqual(["p: model returned no valid tag proposal"]);
  });

  it("stops further model calls when the next estimate would exceed the $10 budget", async () => {
    const called: string[] = [];
    const result = await runRetag({
      readManifest: async () => [entry("a"), entry("b")],
      readPage: async id => page(id),
      writePage: async () => {},
      writeManifest: async () => {},
      propose: async input => {
        called.push(input.title);
        return { tags: ["Philosophy Knowledge and Society"], usage: { input_tokens: 9_000_000, output_tokens: 200_000 } };
      },
      now: () => "2026-08-20T00:00:00.000Z",
    });
    expect(called).toEqual(["a"]);
    expect(result.aborted).toBe(true);
    expect(result.skipped).toContain("b");
  });
});

describe("proposeRetag", () => {
  it("sends title and excerpt as untrusted data to Haiku", async () => {
    let request: RequestInit | undefined;
    const proposal = await proposeRetag({
      title: "Caesar",
      excerpt: "Gallic notes.",
      tags: ["History of Education"],
      prompt: "Controller.",
      apiKey: "key",
      fetchImpl: async (url, init) => {
        expect(url).toBe("https://api.anthropic.com/v1/messages");
        request = init;
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: '{"tags":["Philosophy Knowledge and Society"]}' }],
            usage: { input_tokens: 100, output_tokens: 20 },
          }),
        );
      },
    });
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({ model: "claude-haiku-4-5", max_tokens: 200 });
    expect(body.system[0]).toMatchObject({ text: "Controller.", cache_control: { type: "ephemeral" } });
    expect(buildRetagPrompt({ title: "Caesar", excerpt: "Gallic notes.", tags: ["History of Education"] })).toContain(
      "<excerpt>Gallic notes.</excerpt>",
    );
    expect(proposal).toEqual({ tags: ["Philosophy Knowledge and Society"], usage: { input_tokens: 100, output_tokens: 20 } });
  });
});
