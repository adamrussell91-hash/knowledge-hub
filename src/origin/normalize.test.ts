import { describe, expect, it } from "vitest";
import { addOrigin, normalizeOrigins, pageMatchesOrigins, removeOrigin } from "./normalize";

describe("origin normalize", () => {
  it("trims, dedupes, and sorts", () => {
    expect(
      normalizeOrigins([
        { kind: "unit", label: " EDST5805 " },
        { kind: "degree", label: "MEd" },
        { kind: "unit", label: "edst5805" },
      ]),
    ).toEqual([
      { kind: "degree", label: "MEd" },
      { kind: "unit", label: "EDST5805" },
    ]);
  });

  it("adds and removes without touching other pills", () => {
    const start = [{ kind: "unit" as const, label: "EDST5805" }];
    const added = addOrigin(start, { kind: "notebook", label: "Brown 2022" });
    expect(added).toEqual([
      { kind: "notebook", label: "Brown 2022" },
      { kind: "unit", label: "EDST5805" },
    ]);
    expect(removeOrigin(added, { kind: "unit", label: "edst5805" })).toEqual([
      { kind: "notebook", label: "Brown 2022" },
    ]);
  });

  it("drops placeholder labels and remaps misnamed programmes", () => {
    expect(
      normalizeOrigins([
        { kind: "degree", label: "Transformational Leadership Certificate" },
        { kind: "degree", label: "Advanced Insights in Cognitive Psychology" },
        { kind: "degree", label: "Graduate Diploma of Psychology" },
        { kind: "degree", label: "CSP-eligible postgraduate degree" },
        { kind: "degree", label: "Trimester 1 2027 entry" },
        { kind: "notebook", label: "Notebook Cover" },
        { kind: "unit", label: "EDUC6119" },
      ]),
    ).toEqual([
      { kind: "degree", label: "Graduate Certificate in Transformational Leadership" },
      { kind: "degree", label: "Master of Cognitive Psychology" },
      { kind: "unit", label: "EDUC6119" },
    ]);
  });

  it("matches required origin pills for later filters", () => {
    const page = {
      origins: [
        { kind: "degree" as const, label: "MEd" },
        { kind: "unit" as const, label: "EDST5805" },
      ],
    };
    expect(pageMatchesOrigins(page, [{ kind: "unit", label: "edst5805" }])).toBe(true);
    expect(pageMatchesOrigins(page, [{ kind: "book", label: "Make It Stick" }])).toBe(false);
  });
});
