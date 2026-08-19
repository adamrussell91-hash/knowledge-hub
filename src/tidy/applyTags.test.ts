import { describe, expect, it } from "vitest";
import { applyTopicTags } from "./applyTags";

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
