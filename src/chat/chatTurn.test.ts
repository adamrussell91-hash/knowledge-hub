import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANSWER_FROM_ARCHIVE, runChatTurn, START_KERNEL_BUDGET_MS } from "./chatTurn";

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
  it("does a quick archive pull for Scoping without calling Claude yet", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => researchResult({ findings: [finding, { ...finding, pageId: "p2" }, { ...finding, pageId: "p3" }] }),
    });
    const complete = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "What do I have on Gagne?" }],
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      complete,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://kernel.test/quick_research");
    expect(JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      query: "Gagne",
      k: 32,
      maxRounds: 1,
      negation: false,
    });
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(complete).not.toHaveBeenCalled();
    expect(result.status).toBe("compose");
    if (result.status !== "compose") return;
    expect(result.coverage?.thin).toBe(false);
    expect(result.research?.findings).toHaveLength(3);
  });

  it("writes the Scoping reply on a second turn that already has archive findings", async () => {
    let system = "";
    const fetchImpl = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "What do I have on Gagne?" }],
      compose: true,
      priorResearch: researchResult({ findings: [finding, { ...finding, pageId: "p2" }, { ...finding, pageId: "p3" }] }),
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      complete: async assembled => {
        system = assembled;
        return "Three clusters, one exemplar each.";
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(system).toContain("Scoping");
    expect(system).toContain("Wide sweep");
    expect(system).toContain("Stoicism notes");
    expect(system).toContain("p1");
    expect(system).not.toContain("Links the thesis to the archive.");
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.reply).toContain("Three clusters");
    expect(result.coverage?.thin).toBe(false);
  });

  it("tells her she can retag notes and lists every note in play", async () => {
    let system = "";
    await runChatTurn({
      voice,
      universityJob,
      hat: "synthesis",
      messages: [{ role: "user", content: "What is the connection?" }],
      compose: true,
      priorResearch: researchResult(),
      notesInPlay: [
        { pageId: "p1", title: "Retrieval practice and spacing" },
        { pageId: "p2", title: "Interleaving in mixed practice sets" },
      ],
      complete: async assembled => {
        system = assembled;
        return "Same mechanism.";
      },
    });
    expect(system).toContain("note-edit");
    expect(system).toContain("Retrieval practice and spacing (p1)");
    expect(system).toContain("Interleaving in mixed practice sets (p2)");
  });

  it("tells her to answer a curriculum question from the archive instead of refusing it", async () => {
    let system = "";
    await runChatTurn({
      voice,
      universityJob,
      hat: "synthesis",
      messages: [{ role: "user", content: "what are some strategies for teaching numeracy to low ability classes" }],
      compose: true,
      priorResearch: researchResult({
        findings: [{ ...finding, pageId: "n1", title: "Differentiation and numeracy", excerpt: "Concrete-pictorial-abstract" }],
      }),
      complete: async assembled => {
        system = assembled;
        return "Start with CPA and keep the load small.";
      },
    });
    expect(system).toContain(ANSWER_FROM_ARCHIVE);
    expect(system).toContain("Never the wrong office");
    expect(system).toContain("Differentiation and numeracy");
    expect(system).not.toMatch(/This is the university office/i);
    expect(system).not.toMatch(/academic writing coach/i);
    expect(system).not.toMatch(/classroom practitioner voice wait/i);
  });

  it("starts a deep Worker session and does not call Claude yet", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: "sess-1", status: "running", result: researchResult({ status: "running", round: 0, findings: [] }) }),
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
    expect(JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      k: 16,
      maxRounds: 5,
      negation: false,
    });
    expect(timeout).toHaveBeenCalledWith(START_KERNEL_BUDGET_MS);
    expect(complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "researching", researchSessionId: "sess-1" });
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

  it("uses the live archive when the kernel comes back empty", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => researchResult({ findings: [] }),
    });
    const complete = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "what do I have on attribution theory" }],
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      archivePull: async () =>
        researchResult({
          query: "attribution theory",
          findings: [{ ...finding, pageId: "page_attr", title: "Weiner attribution theory" }],
        }),
      complete,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.status).toBe("compose");
    if (result.status !== "compose") return;
    expect(result.archiveFailed).toBeFalsy();
    expect(result.research?.findings[0]?.pageId).toBe("page_attr");
  });

  it("uses the live archive when the kernel is missing or times out", async () => {
    const complete = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "what do I have on attribution theory" }],
      archivePull: async () =>
        researchResult({
          query: "attribution theory",
          findings: [{ ...finding, pageId: "page_attr", title: "Weiner attribution theory" }],
        }),
      complete,
    });
    expect(result.status).toBe("compose");
    if (result.status !== "compose") return;
    expect(result.archiveFailed).toBeFalsy();
    expect(result.research?.findings[0]?.title).toMatch(/attribution/i);
  });

  it("recovers live archive notes on the compose turn if the first pull was empty", async () => {
    let system = "";
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "what do I have on attribution theory" }],
      compose: true,
      priorResearch: researchResult({ findings: [] }),
      archivePull: async () =>
        researchResult({
          findings: [{ ...finding, pageId: "page_attr", title: "Weiner attribution theory" }],
        }),
      complete: async assembled => {
        system = assembled;
        return "You have Weiner on the stack.";
      },
    });
    expect(system).toContain("page_attr");
    expect(system).toContain("Weiner attribution theory");
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.archiveFailed).toBeFalsy();
    expect(result.research?.findings[0]?.pageId).toBe("page_attr");
  });

  it("starts a Worker write after the archive pull and does not call Claude on Netlify", async () => {
    const complete = vi.fn();
    const write = {
      start: vi.fn(async () => ({ writeSessionId: "w-1", status: "writing" as const })),
      poll: vi.fn(),
    };
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "self determination theory" }],
      archivePull: async () =>
        researchResult({
          findings: Array.from({ length: 3 }, (_, index) => ({ ...finding, pageId: `p${index + 1}` })),
        }),
      write,
      complete,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(write.start).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "writing", writeSessionId: "w-1" });
  });

  it("polls a Worker write until the reply is ready", async () => {
    const complete = vi.fn();
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [{ role: "user", content: "self determination theory" }],
      writeSessionId: "w-1",
      write: {
        start: async () => ({ writeSessionId: "w-1", status: "writing" }),
        poll: async () => ({
          writeSessionId: "w-1",
          status: "done",
          reply: "Three clusters from the stack.",
          research: researchResult({ findings: [finding, { ...finding, pageId: "p2" }, { ...finding, pageId: "p3" }] }),
        }),
      },
      complete,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.reply).toContain("Three clusters");
    expect(result.research?.findings).toHaveLength(3);
  });

  it("writes from the sitting library on a follow-up without a new archive pull", async () => {
    const fetchImpl = vi.fn();
    const archivePull = vi.fn();
    const write = {
      start: vi.fn(async (input: { system: string }) => {
        expect(input.system).toContain("sitting's searched notes");
        expect(input.system).toContain("Stoicism notes");
        return { writeSessionId: "w-lib", status: "writing" as const };
      }),
      poll: vi.fn(),
    };
    const result = await runChatTurn({
      voice,
      universityJob,
      hat: "scoping",
      messages: [
        { role: "user", content: "self determination theory" },
        { role: "assistant", content: "A first brief." },
        { role: "user", content: "Say more about autonomy" },
      ],
      sittingLibrary: researchResult({ findings: [finding, { ...finding, pageId: "p2" }] }),
      kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
      archivePull,
      write,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(archivePull).not.toHaveBeenCalled();
    expect(write.start).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "writing", writeSessionId: "w-lib" });
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
