import { describe, expect, it } from "vitest";
import { applyCancel, DEFAULT_MAX_MS, initialSession, runRound } from "./round";
import type { ResearchFinding } from "./schema";

function finding(pageId: string): ResearchFinding {
  return {
    pageId,
    title: pageId,
    sourceUrl: `https://notion.so/${pageId}`,
    excerpt: "excerpt",
    stance: "supports",
    analysis: "because",
  };
}

describe("runRound", () => {
  it("gives a deep sitting minutes on the Worker clock, not a request budget", () => {
    expect(DEFAULT_MAX_MS).toBe(10 * 60 * 1000);
  });

  it("retrieves the original query once and synthesizes once on round 1", async () => {
    const retrieved: string[] = [];
    const next = await runRound(initialSession({ query: "original" }), {
      retrieve: async query => {
        retrieved.push(query);
        return [{ pageId: "p1", title: "P1", excerpt: "e", score: 1 }];
      },
      fetchBodies: async () => new Map([["p1", { title: "P1", excerpt: "e", sourceUrl: "https://notion.so/p1" }]]),
      synthesize: async () => ({
        findings: [finding("p1")],
        gaps: ["need counterargument"],
        followUpQueries: ["stoic critics"],
      }),
      now: () => 0,
    });
    expect(retrieved).toEqual(["original"]);
    expect(next.round).toBe(1);
    expect(next.status).toBe("running");
    expect(next.followUpQueries).toEqual(["stoic critics"]);
    expect(next.findings).toHaveLength(1);
  });

  it("retrieves a negation query on round 1 when the hat asks for contested evidence", async () => {
    const retrieved: string[] = [];
    await runRound(initialSession({ query: "Gagne", negation: true }), {
      retrieve: async query => {
        retrieved.push(query);
        return [{ pageId: "p1", title: "P1", excerpt: "e", score: 1 }];
      },
      fetchBodies: async () => new Map([["p1", { title: "P1", excerpt: "e", sourceUrl: "https://notion.so/p1" }]]),
      synthesize: async () => ({ findings: [finding("p1")], gaps: [], followUpQueries: [] }),
      now: () => 0,
      finalize: true,
    });
    expect(retrieved).toEqual(["Gagne", "What challenges, limits, or contradicts: Gagne"]);
  });

  it("uses previous follow-ups as the next retrieve input, not a second retrieve in the same round", async () => {
    const retrieved: string[] = [];
    const afterFirst = await runRound(initialSession({ query: "original" }), {
      retrieve: async query => {
        retrieved.push(query);
        return [{ pageId: "p1", title: "P1", excerpt: "e", score: 1 }];
      },
      fetchBodies: async () => new Map([["p1", { title: "P1", excerpt: "e", sourceUrl: "https://notion.so/p1" }]]),
      synthesize: async () => ({
        findings: [finding("p1")],
        gaps: ["g"],
        followUpQueries: ["follow-up A", "follow-up B"],
      }),
      now: () => 0,
    });
    await runRound(afterFirst, {
      retrieve: async query => {
        retrieved.push(query);
        return [{ pageId: "p2", title: "P2", excerpt: "e", score: 1 }];
      },
      fetchBodies: async () => new Map([["p2", { title: "P2", excerpt: "e", sourceUrl: "https://notion.so/p2" }]]),
      synthesize: async () => ({
        findings: [finding("p2")],
        gaps: [],
        followUpQueries: [],
      }),
      now: () => 1,
    });
    expect(retrieved).toEqual(["original", "follow-up A", "follow-up B"]);
  });

  it("marks quick mode done after the same single round of work", async () => {
    const next = await runRound(initialSession({ query: "q" }), {
      retrieve: async () => [{ pageId: "p1", title: "P1", excerpt: "e", score: 1 }],
      fetchBodies: async () => new Map([["p1", { title: "P1", excerpt: "e", sourceUrl: "https://notion.so/p1" }]]),
      synthesize: async () => ({
        findings: [finding("p1")],
        gaps: ["still open"],
        followUpQueries: ["would be round 2"],
      }),
      now: () => 0,
      finalize: true,
    });
    expect(next.status).toBe("done");
    expect(next.round).toBe(1);
    expect(next.followUpQueries).toEqual(["would be round 2"]);
  });

  it("finalizes when the round cap is hit", async () => {
    let state = initialSession({ query: "q" });
    for (let round = 0; round < 5; round++) {
      state = await runRound(state, {
        retrieve: async () => [{ pageId: `p${round}`, title: "T", excerpt: "e", score: 1 }],
        fetchBodies: async () =>
          new Map([[`p${round}`, { title: "T", excerpt: "e", sourceUrl: "https://notion.so/x" }]]),
        synthesize: async () => ({
          findings: [finding(`p${round}`)],
          gaps: ["g"],
          followUpQueries: ["more"],
        }),
        now: () => round,
        maxRounds: 5,
      });
    }
    expect(state.round).toBe(5);
    expect(state.status).toBe("done");
  });

  it("dedupes findings by pageId only when finalizing", async () => {
    const first = await runRound(initialSession({ query: "q" }), {
      retrieve: async () => [{ pageId: "p1", title: "P1", excerpt: "e", score: 1 }],
      fetchBodies: async () => new Map([["p1", { title: "P1", excerpt: "e", sourceUrl: "https://notion.so/p1" }]]),
      synthesize: async () => ({
        findings: [finding("p1")],
        gaps: ["g"],
        followUpQueries: ["next"],
      }),
      now: () => 0,
    });
    expect(first.findings).toHaveLength(1);
    const done = await runRound(first, {
      retrieve: async () => [{ pageId: "p1", title: "P1", excerpt: "e", score: 1 }],
      fetchBodies: async () => new Map([["p1", { title: "P1", excerpt: "e", sourceUrl: "https://notion.so/p1" }]]),
      synthesize: async () => ({
        findings: [finding("p1")],
        gaps: [],
        followUpQueries: [],
      }),
      now: () => 1,
    });
    expect(done.status).toBe("done");
    expect(done.findings).toHaveLength(1);
  });
});

describe("applyCancel", () => {
  it("keeps findings and sets cancelled", () => {
    const cancelled = applyCancel({
      ...initialSession({ query: "q" }),
      findings: [finding("p1")],
      status: "running",
      round: 1,
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.findings).toHaveLength(1);
  });
});
