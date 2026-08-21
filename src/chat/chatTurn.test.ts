import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runChatTurn } from "./chatTurn";

const voice = readFileSync(join(process.cwd(), "prompts/clementine-voice.md"), "utf8");
const universityJob = readFileSync(join(process.cwd(), "prompts/clementine-university.md"), "utf8");

const finding = {
  pageId: "p1",
  title: "Stoicism notes",
  sourceUrl: "https://example.test/p1",
  excerpt: "CBT borrows exercises",
  stance: "supports" as const,
  analysis: "Links the thesis to the archive.",
};

function researchResult(overrides: Record<string, unknown> = {}) {
  return {
    query: "warrant",
    round: 1,
    status: "done" as const,
    findings: [finding],
    gaps: [],
    followUpQueries: [],
    ...overrides,
  };
}

describe("runChatTurn", () => {
  it("does a quick archive pull for Scoping and names the hat in the prompt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => researchResult({ findings: [finding, { ...finding, pageId: "p2" }, { ...finding, pageId: "p3" }] }),
    });
    let system = "";
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "What do I have on Gagne?" }],
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      complete: async assembled => {
        system = assembled;
        return "Three clusters, one exemplar each.";
      },
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://kernel.test/quick_research");
    expect(system).toContain("Scoping");
    expect(system).toContain("Wide sweep");
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.reply).toContain("Three clusters");
    expect(result.coverage?.thin).toBe(false);
  });

  it("starts a deep Worker session and does not call Claude yet", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: "sess-1", status: "running", result: researchResult({ status: "running", findings: [] }) }),
    });
    const complete = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "synthesis",
      depth: "iterative",
      messages: [{ role: "user", content: "Synthesise Gagne" }],
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      complete,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://kernel.test/deep_research/start");
    expect(complete).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "researching", researchSessionId: "sess-1" });
  });

  it("polls a finished deep session then completes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => researchResult({ status: "done" }),
    });
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "synthesis",
      depth: "iterative",
      researchSessionId: "sess-1",
      messages: [{ role: "user", content: "Synthesise Gagne" }],
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      complete: async () => "A structured brief.",
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://kernel.test/deep_research/sess-1");
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.reply).toBe("A structured brief.");
  });

  it("does not invent a web search when Search outside is clicked", async () => {
    const fetchImpl = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "internalExternal",
      searchOutside: true,
      messages: [{ role: "user", content: "Search outside" }],
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      complete: async () => "should not run",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("external-unavailable");
  });
});
