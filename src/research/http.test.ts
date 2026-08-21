import { describe, expect, it, vi } from "vitest";
import { handleResearchRequest } from "./http";
import type { ResearchBindings } from "./http";

function bindings(overrides: Partial<ResearchBindings> = {}): ResearchBindings {
  return {
    secret: "kernel-secret",
    allowedOrigin: "https://teaching-hub.example",
    runQuick: async () => ({
      query: "q",
      round: 1,
      status: "done",
      findings: [],
      gaps: [],
      followUpQueries: [],
    }),
    startDeep: async () => ({
      sessionId: "sess-1",
      status: "running",
      result: {
        query: "q",
        round: 1,
        status: "running",
        findings: [],
        gaps: [],
        followUpQueries: ["next"],
      },
    }),
    getDeep: async () => ({
      query: "q",
      round: 1,
      status: "running",
      findings: [],
      gaps: [],
      followUpQueries: [],
    }),
    cancelDeep: async () => ({ status: "cancelled" }),
    ...overrides,
  };
}

describe("handleResearchRequest", () => {
  it("rejects missing shared secret", async () => {
    const response = await handleResearchRequest(
      new Request("https://kernel.test/quick_research", {
        method: "POST",
        headers: { Origin: "https://teaching-hub.example", "Content-Type": "application/json" },
        body: JSON.stringify({ query: "q" }),
      }),
      bindings(),
    );
    expect(response.status).toBe(401);
  });

  it("passes retrieve knobs through to quick research", async () => {
    const runQuick = vi.fn(async (input: { query: string; k?: number; tags?: string[]; negation?: boolean }) => ({
      query: input.query,
      round: 1,
      status: "done" as const,
      findings: [],
      gaps: [],
      followUpQueries: [],
    }));
    const response = await handleResearchRequest(
      new Request("https://kernel.test/quick_research", {
        method: "POST",
        headers: {
          Origin: "https://teaching-hub.example",
          "Content-Type": "application/json",
          "x-research-kernel-secret": "kernel-secret",
        },
        body: JSON.stringify({
          query: "methods",
          k: 8,
          tags: ["Research Methods and Evidence Literacy"],
          negation: true,
        }),
      }),
      bindings({ runQuick }),
    );
    expect(response.status).toBe(200);
    expect(runQuick).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "methods",
        k: 8,
        tags: ["Research Methods and Evidence Literacy"],
        negation: true,
      }),
    );
  });

  it("routes quick research after auth", async () => {
    const response = await handleResearchRequest(
      new Request("https://kernel.test/quick_research", {
        method: "POST",
        headers: {
          Origin: "https://teaching-hub.example",
          "Content-Type": "application/json",
          "x-research-kernel-secret": "kernel-secret",
        },
        body: JSON.stringify({ query: "q" }),
      }),
      bindings(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "done", round: 1 });
  });
});
