import { describe, expect, it } from "vitest";
import { coverageFromResearch } from "./coverage";

describe("archive coverage", () => {
  it("marks a thin pull when few distinct sources or gaps dominate", () => {
    expect(
      coverageFromResearch({
        findings: [{ pageId: "p1" }, { pageId: "p1" }],
        gaps: ["no methods notes", "no counter-reading"],
      }),
    ).toEqual({
      distinctSources: 1,
      gapCount: 2,
      thin: true,
    });
  });

  it("is not thin when three distinct archive pages land with no gaps", () => {
    expect(
      coverageFromResearch({
        findings: [{ pageId: "a" }, { pageId: "b" }, { pageId: "c" }],
        gaps: [],
      }),
    ).toEqual({ distinctSources: 3, gapCount: 0, thin: false });
  });
});
