import { describe, expect, it } from "vitest";
import { ResearchFindingSchema, ResearchResultSchema } from "./schema";

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

  it("keeps a finding when optional evidence fields are missing or malformed", () => {
    const parsed = ResearchFindingSchema.parse({
      pageId: "p1",
      title: "T",
      sourceUrl: "https://example.test/p1",
      excerpt: "e",
      stance: "supports",
      analysis: "why",
      sourceType: "empirical study",
      claimRelationship: "direct support",
      confidence: "pretty high",
      keyFinding: "Need satisfaction tracks wellbeing",
    });
    expect(parsed.sourceType).toBeUndefined();
    expect(parsed.claimRelationship).toBeUndefined();
    expect(parsed.confidence).toBeUndefined();
    expect(parsed.keyFinding).toBe("Need satisfaction tracks wellbeing");
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
