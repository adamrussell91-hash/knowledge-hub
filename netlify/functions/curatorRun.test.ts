import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCuratorRun } from "./curatorRun";

const now = "2026-08-18T13:50:22.000Z";

function pageJson(id: string, title: string, body: string) {
  return JSON.stringify({
    id,
    title,
    area: "notes",
    tags: [],
    body,
    connected: [],
    attachments: [],
    source_notion_id: id,
    source_notion_url: `https://notion.so/${id}`,
    created_at: now,
    updated_at: now,
    schema_version: 1,
  });
}

describe("executeCuratorRun", () => {
  afterEach(() => vi.restoreAllMocks());

  it("processes recent captures when curator state has never been seeded", async () => {
    const files = new Map<string, { sha: string; text: string }>();
    files.set("pages/page_a.json", { sha: "a", text: pageJson("page_a", "Duty", "Inherited duty") });
    files.set("pages/page_b.json", { sha: "b", text: pageJson("page_b", "Heaney", "the poem") });
    const puts: string[] = [];

    const result = await executeCuratorRun({
      repo: "owner/data",
      token: "tok",
      deps: {
        getContent: async (_repo, _token, file) => files.get(file) ?? null,
        putContent: async (_repo, _token, file, text) => {
          puts.push(file);
          files.set(file, { sha: "next", text });
        },
        githubGet: async url => {
          if (url.endsWith("/commits/HEAD")) return { sha: "head" };
          if (url.includes("/commits?path=pages")) {
            return [{ sha: "new", parents: [{ sha: "before" }] }];
          }
          if (url.includes("/compare/before...head")) {
            return { files: [{ filename: "pages/page_a.json", status: "modified" }] };
          }
          throw new Error(url);
        },
        loadCorpus: async () => [
          { pageId: "page_a", title: "Duty", excerpt: "Inherited duty", vector: [1, 0] },
          { pageId: "page_b", title: "Heaney", excerpt: "the poem", vector: [0.8, 0.6] },
        ],
        embed: async () => [1, 0],
        judge: async (_note, candidates) =>
          candidates.map(hit => ({
            pageId: hit.pageId,
            related: true,
            relation: "related" as const,
            rationale: "shared duty",
          })),
        now: () => now,
      },
    });

    expect(result.proposed).toBe(1);
    expect(puts).toContain("_curator/pending-proposals.json");
    expect(puts).toContain("_curator/state.json");
    const pending = JSON.parse(files.get("_curator/pending-proposals.json")?.text ?? "[]") as { noteB: string }[];
    expect(pending[0]?.noteB).toBe("page_b");
  });
});
