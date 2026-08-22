import { describe, expect, it } from "vitest";
import { cardSupportingText } from "./cardText";

describe("cardSupportingText", () => {
  it("hides an excerpt that repeats the title", () => {
    expect(cardSupportingText("AI vs Human Feedback", "AI vs Human Feedback")).toBe("");
    expect(cardSupportingText("AI vs Human Feedback", "ai vs human feedback.")).toBe("");
  });

  it("hides a title that is only a truncated excerpt", () => {
    expect(
      cardSupportingText(
        "AACAP Guidelines for Supporting LGBTQ Youth Ment",
        "AACAP Guidelines for Supporting LGBTQ Youth Mental Health",
      ),
    ).toBe("");
  });

  it("keeps a real supporting line", () => {
    expect(cardSupportingText("AI vs Human Feedback", "Students trusted the teacher more than the model.")).toBe(
      "Students trusted the teacher more than the model.",
    );
  });

  it("hides a blank excerpt", () => {
    expect(cardSupportingText("A note", "   ")).toBe("");
  });
});
