import { describe, expect, it } from "vitest";
import { ResearchResultSchema } from "./schema";

describe("ResearchResultSchema", () => {
  it("accepts cancelled as a terminal status", () => {
    const parsed = ResearchResultSchema.parse({
      query: "stoicism",
      round: 1,
      status: "cancelled",
      findings: [],
      gaps: [],
      followUpQueries: [],
    });
    expect(parsed.status).toBe("cancelled");
  });

  it("rejects unknown statuses", () => {
    expect(() =>
      ResearchResultSchema.parse({
        query: "stoicism",
        round: 1,
        status: "pending",
        findings: [],
        gaps: [],
        followUpQueries: [],
      }),
    ).toThrow();
  });
});
