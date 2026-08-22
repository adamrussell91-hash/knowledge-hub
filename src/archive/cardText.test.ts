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

  it("shows a readable line instead of raw markdown", () => {
    expect(
      cardSupportingText(
        "Errors the fantasy of infallibility",
        "**Religious Texts and Early Christianity** **Jewish and Christian Texts** - **Mishnah and Talmud**: Jewish legal codes. - Early Christianity ...",
      ),
    ).toBe(
      "Religious Texts and Early Christianity Jewish and Christian Texts Mishnah and Talmud: Jewish legal codes. Early Christianity ...",
    );
  });
});
