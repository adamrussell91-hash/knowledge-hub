import { describe, expect, it } from "vitest";
import { auditSynthesisReply, corpusAuditFromResearch, formatCorpusAudit, thematicSynthesisProtocol } from "./synthesisProtocol";

const finding = {
  pageId: "p1",
  title: "SDT",
  sourceUrl: "https://example.test/p1",
  excerpt: "Need satisfaction",
  stance: "supports" as const,
  analysis: "why",
  sourceType: "conceptual" as const,
  method: "theoretical review",
  keyFinding: "Needs link motivation and wellbeing",
  claimRelationship: "direct" as const,
  tags: ["Motivation and Self Regulation"],
};

describe("corpusAuditFromResearch", () => {
  it("reports exact coverage counts and leaves code counts unavailable", () => {
    const audit = corpusAuditFromResearch({
      query: "motivation and wellbeing",
      round: 3,
      status: "done",
      findings: [
        finding,
        {
          ...finding,
          pageId: "p2",
          stance: "related",
          sourceType: "unknown",
          method: undefined,
          keyFinding: undefined,
          tags: ["High Potential and High Ability Education"],
        },
      ],
      gaps: ["wellbeing measures"],
      followUpQueries: [],
    });
    expect(audit).toMatchObject({
      retrieved: 2,
      distinctSources: 2,
      central: 1,
      peripheral: 1,
      sourceTypeKnown: 1,
      methodKnown: 1,
      keyFindingKnown: 1,
      gapCount: 1,
      rounds: 3,
    });
    expect(audit.tags.map(item => item.tag)).toEqual([
      "High Potential and High Ability Education",
      "Motivation and Self Regulation",
    ]);
    const note = formatCorpusAudit(audit);
    expect(note).toContain("Notes retrieved: 2");
    expect(note).toContain("Source type known: 1/2");
    expect(note).toContain("initial code count");
    expect(note).toContain("Not available from the current database export");
    expect(note).toContain("high = two or more direct sources");
  });
});

describe("thematicSynthesisProtocol", () => {
  it("requires an evidence architecture without dropping the central claim", () => {
    const protocol = thematicSynthesisProtocol();
    expect(protocol).toContain("central synthesis claim");
    expect(protocol).toContain("Theme evidence matrix");
    expect(protocol).toContain("Method trace");
    expect(protocol).toContain("Direct finding");
    expect(protocol).toContain("Cross source inference");
    expect(protocol).toContain("level of explanation");
    expect(protocol).toContain("Not available from the current database export");
    expect(protocol).toMatch(/do not regress into an annotated bibliography/i);
  });
});

describe("auditSynthesisReply", () => {
  it("flags a fluent memo that has no research infrastructure", () => {
    const audit = auditSynthesisReply("Motivation and wellbeing are entangled because the same conditions affect both.");
    expect(audit.present).toEqual([]);
    expect(audit.missing).toContain("claim");
    expect(audit.missing).toContain("matrix");
  });

  it("accepts a structured research product", () => {
    const audit = auditSynthesisReply(`
## Research question interpreted
What links motivation and wellbeing?

## Corpus summary
Notes retrieved: 11.

## Method trace
Hybrid coding. Inclusion threshold: two sources.

## Central synthesis claim
Need support binds both outcomes.

## Theme evidence matrix
| Theme | Direct support |

## Theoretical integration
Different explanatory levels.

## Contradictions and limits
| Issue | Severity |

## Answer to the research question
They are structurally entangled. Confidence: medium.
`);
    expect(audit.missing).toEqual([]);
  });
});
