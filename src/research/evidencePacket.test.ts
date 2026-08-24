import { describe, expect, it } from "vitest";
import { evidenceFields, formatEvidencePacket, themeConfidence } from "./evidencePacket";
import type { ResearchFinding } from "./schema";

function finding(overrides: Partial<ResearchFinding> = {}): ResearchFinding {
  return {
    pageId: "p1",
    title: "SDT",
    sourceUrl: "https://example.test/p1",
    excerpt: "Need satisfaction",
    stance: "supports",
    analysis: "why",
    ...overrides,
  };
}

describe("themeConfidence", () => {
  it("rates high only when direct or mixed theoretical-empirical support is present", () => {
    expect(themeConfidence({ direct: 2, empirical: 0, theoretical: 0 })).toBe("high");
    expect(themeConfidence({ direct: 0, empirical: 1, theoretical: 1 })).toBe("high");
    expect(themeConfidence({ direct: 1, empirical: 0, theoretical: 0 })).toBe("medium");
    expect(themeConfidence({ direct: 0, empirical: 0, theoretical: 1 })).toBe("low");
  });
});

describe("evidenceFields", () => {
  it("does not invent missing method or population", () => {
    expect(evidenceFields(finding()).method).toBe("Not available from the current database export.");
    expect(evidenceFields(finding({ method: "person-centred profiles", population: "science students" })).method).toBe(
      "person-centred profiles",
    );
  });
});

describe("formatEvidencePacket", () => {
  it("exposes source type and claim relationship for the write prompt", () => {
    const line = formatEvidencePacket(
      finding({
        sourceType: "empirical",
        claimRelationship: "direct",
        keyFinding: "Profiles varied within the cohort",
        tags: ["Motivation and Self Regulation"],
      }),
    );
    expect(line).toContain("type: empirical");
    expect(line).toContain("claim relationship: direct");
    expect(line).toContain("Profiles varied within the cohort");
    expect(line).toContain("Motivation and Self Regulation");
  });
});
