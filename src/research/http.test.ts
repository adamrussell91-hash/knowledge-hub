import { describe, expect, it } from "vitest";
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
