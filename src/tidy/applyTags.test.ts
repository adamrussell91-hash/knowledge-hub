import { describe, expect, it } from "vitest";
import { applyTopicTags, toggleTopicTag } from "./applyTags";

describe("applyTopicTags", () => {
  it("preserves structural tags, maps onto the closed list, drops unknowns, and caps at three", () => {
    expect(
      applyTopicTags(
        ["Note", "EDST5805", "Educational Psychology"],
        [
          "philosophy knowledge and society",
          "History",
          "Learning Science and Cognition",
          "Motivation and Self Regulation",
          "Pedagogy and Instructional Design",
        ],
      ),
    ).toEqual([
      "Note",
      "EDST5805",
      "Philosophy Knowledge and Society",
      "Learning Science and Cognition",
      "Motivation and Self Regulation",
    ]);
  });
});

describe("toggleTopicTag", () => {
  it("selects a closed-list tag and leaves structural tags in place", () => {
    expect(toggleTopicTag(["Note", "EDST5805"], "Learning Science and Cognition")).toEqual([
      "Note",
      "EDST5805",
      "Learning Science and Cognition",
    ]);
  });

  it("clears a selected tag", () => {
    expect(
      toggleTopicTag(
        ["Note", "Learning Science and Cognition", "Pedagogy and Instructional Design"],
        "Learning Science and Cognition",
      ),
    ).toEqual(["Note", "Pedagogy and Instructional Design"]);
  });

  it("ignores a fourth topic tag", () => {
    const existing = [
      "Note",
      "Learning Science and Cognition",
      "Motivation and Self Regulation",
      "Pedagogy and Instructional Design",
    ];
    expect(toggleTopicTag(existing, "Wellbeing Mental Health and Trauma")).toEqual(existing);
  });

  it("drops unknown tags and folds case onto the closed list", () => {
    expect(toggleTopicTag(["Note", "History"], "philosophy knowledge and society")).toEqual([
      "Note",
      "Philosophy Knowledge and Society",
    ]);
  });
});
