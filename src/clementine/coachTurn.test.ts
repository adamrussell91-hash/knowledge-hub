import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCoachTurn } from "./coachTurn";

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

describe("runCoachTurn", () => {
  it("assembles voice, university job, thesis, and chat before completing", async () => {
    let system = "";
    const result = await runCoachTurn({
      voice,
      universityJob,
      workingThesis: "CBT secularises stoicism.",
      messages: [{ role: "user", content: "Does the warrant hold?" }],
      complete: async (assembled, messages) => {
        system = assembled;
        expect(messages).toEqual([{ role: "user", content: "Does the warrant hold?" }]);
        return "Name the claim before you decorate it.";
      },
    });
    expect(result.reply).toContain("Name the claim");
    expect(system).toContain("Professor Clementine Haig");
    expect(system).toContain("research and knowledge synthesizer");
    expect(system).toContain("CBT secularises stoicism.");
    expect(system).toContain("Does the warrant hold?");
    expect(system).toContain("Never refuse a question as the wrong office");
    expect(system).not.toMatch(/university writing-coach/i);
    expect(system).not.toMatch(/academic writing coach/i);
    expect(system).not.toMatch(/Central Node/i);
  });

  it("sends the kernel secret on the Worker request and omits it from the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => researchResult(),
    });
    const result = await runCoachTurn({
      voice,
      universityJob,
      workingThesis: "working claim",
      draft: "Paragraph one of the draft.",
      messages: [{ role: "user", content: "Find archive support" }],
      kernel: {
        url: "https://kernel.test",
        secret: "super-secret-kernel",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      complete: async () => "Here is the brief.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kernel.test/quick_research");
    expect((init.headers as Record<string, string>)["x-research-kernel-secret"]).toBe("super-secret-kernel");
    const body = JSON.parse(String(init.body)) as { query: string; documentContext: string };
    expect(body.query).toBe("Find archive support");
    expect(body.documentContext).toContain("working claim");
    expect(body.documentContext).toContain("Paragraph one");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-kernel");
    expect(result.research?.findings[0]?.pageId).toBe("p1");
  });

  it("continues in character when the kernel fails", async () => {
    const result = await runCoachTurn({
      voice,
      universityJob,
      messages: [{ role: "user", content: "Help" }],
      kernel: {
        url: "https://kernel.test",
        secret: "super-secret-kernel",
        fetchImpl: vi.fn().mockRejectedValue(new Error("timeout")) as unknown as typeof fetch,
      },
      complete: async assembled => {
        expect(assembled).toMatch(/archive pull failed/i);
        return "The archive would not open. We will work with the draft you already have.";
      },
    });
    expect(result.archiveFailed).toBe(true);
    expect(result.reply).toContain("archive would not open");
    expect(result.research).toBeUndefined();
  });

  it("tells her empty retrieval is unusable archive, not no results found", async () => {
    const result = await runCoachTurn({
      voice,
      universityJob,
      messages: [{ role: "user", content: "Gagne" }],
      kernel: {
        url: "https://kernel.test",
        secret: "k",
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => researchResult({ findings: [], gaps: ["no DMGT notes"] }),
        }) as unknown as typeof fetch,
      },
      complete: async assembled => {
        expect(assembled).toContain("did not give you anything usable");
        expect(assembled).toContain("no DMGT notes");
        return "The shelves were silent on DMGT.";
      },
    });
    expect(result.research?.findings).toEqual([]);
    expect(result.reply).toContain("silent");
  });

  it("throws before any network call when the voice file is missing", async () => {
    const complete = vi.fn();
    const fetchImpl = vi.fn();
    await expect(
      runCoachTurn({
        voice: "",
        universityJob,
        messages: [{ role: "user", content: "Hi" }],
        kernel: { url: "https://kernel.test", secret: "k", fetchImpl: fetchImpl as unknown as typeof fetch },
        complete,
      }),
    ).rejects.toThrow(/clementine-voice\.md/);
    expect(complete).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
