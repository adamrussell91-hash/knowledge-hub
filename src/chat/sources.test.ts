import { describe, expect, it } from "vitest";
import { researchFromFindings, searchedNotesHtml, sourceTake, thinkingHistoryHtml } from "./sources";

const finding = {
  pageId: "page_notion_1",
  title: "Self-determination theory",
  sourceUrl: "https://example.test/1",
  excerpt: "Autonomy, competence, and relatedness.",
  stance: "supports" as const,
  analysis: "Clementine used this note for the three basic needs and how they show up in curriculum design.",
};

describe("sourceTake", () => {
  it("prefers analysis and keeps the card short", () => {
    expect(sourceTake(finding)).toContain("three basic needs");
    expect(sourceTake({ ...finding, analysis: "A".repeat(400) }).endsWith("…")).toBe(true);
    expect(sourceTake({ ...finding, analysis: "", excerpt: "" })).toBe("supports");
    expect(sourceTake({ ...finding, keyFinding: "Need satisfaction tracked wellbeing." })).toBe(
      "Need satisfaction tracked wellbeing.",
    );
  });
});

describe("searched notes chrome", () => {
  it("renders compact clickable rows instead of long citation cards", () => {
    const html = searchedNotesHtml([finding, { ...finding, pageId: "ext-1", title: "Web" }], false, 2);
    expect(html).toContain("Searched notes (1)");
    expect(html).toContain('data-open-page="page_notion_1"');
    expect(html).toContain("chat__source-title");
    expect(html).not.toContain("ext-1");
    expect(html).toContain('data-searched-notes="2"');
  });

  it("folds thinking history behind a toggle", () => {
    const html = thinkingHistoryHtml(["Round 1/1 — 32 notes, 0 follow-ups", "Writing from 32 archive notes"]);
    expect(html).toContain("Thinking history");
    expect(html).toContain("Writing from 32 archive notes");
    expect(html).toContain("data-thinking-history");
  });

  it("keeps archive findings for a follow-up sitting library", () => {
    expect(researchFromFindings([finding, { ...finding, pageId: "ext-9" }]).findings).toEqual([finding]);
  });
});
