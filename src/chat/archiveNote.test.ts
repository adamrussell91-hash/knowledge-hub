import { describe, expect, it } from "vitest";
import { compactArchiveNote, compactSittingNote, compactSynthesisNote } from "./archiveNote";

function finding(id: string, title = `Note ${id}`) {
  return {
    pageId: id,
    title,
    sourceUrl: `https://example.test/${id}`,
    excerpt: "A".repeat(400),
    stance: "related" as const,
    analysis: "A long analysis that must not be dumped into the write prompt.",
  };
}

describe("compactArchiveNote", () => {
  it("keeps eight excerpts and lists the rest as titles", () => {
    const findings = Array.from({ length: 12 }, (_, index) => finding(`p${index + 1}`));
    const note = compactArchiveNote({
      query: "q",
      round: 1,
      status: "done",
      findings,
      gaps: [],
      followUpQueries: [],
    });
    expect(note).toContain("12 notes");
    expect(note).toContain("[Title](pageId)");
    expect(note).toMatch(/never write a raw page id/i);
    expect(note).toContain("p1");
    expect(note).toContain("p8");
    expect(note).toContain("4 further notes");
    expect(note).toContain("p12");
    expect(note).not.toMatch(/long analysis/i);
    expect(note).not.toContain("A".repeat(400));
  });

  it("attaches evidence packets on a synthesis sitting", () => {
    const note = compactSynthesisNote({
      query: "q",
      round: 2,
      status: "done",
      findings: [
        {
          ...finding("p1", "McGregor"),
          sourceType: "empirical",
          method: "person-centred profiles",
          population: "high ability science students",
          keyFinding: "Motivational profiles varied within the cohort",
          claimRelationship: "direct",
          confidence: "medium",
        },
      ],
      gaps: [],
      followUpQueries: [],
    });
    expect(note).toContain("type: empirical");
    expect(note).toContain("person-centred profiles");
    expect(note).toContain("Motivational profiles varied within the cohort");
    expect(note).toContain("do not invent");
  });

  it("tells a follow-up to use the sitting notes first", () => {
    const note = compactSittingNote({
      query: "q",
      round: 1,
      status: "done",
      findings: [finding("p1")],
      gaps: [],
      followUpQueries: [],
    });
    expect(note).toContain("sitting's searched notes");
    expect(note).toContain("p1");
  });
});
