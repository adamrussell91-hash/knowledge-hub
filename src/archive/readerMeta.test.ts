import { describe, expect, it } from "vitest";
import { readerTopicPillsHtml } from "./readerMeta";

describe("reader topic pills", () => {
  it("does not repeat the eyebrow topic, and never uses middot chips", () => {
    const html = readerTopicPillsHtml([
      "Philosophy Knowledge and Society",
      "Research Methods and Evidence Literacy",
      "Higher Education and Academic Practice",
    ]);
    expect(html).not.toContain("Philosophy Knowledge and Society");
    expect(html).toContain("Research Methods and Evidence Literacy");
    expect(html).toContain("Higher Education and Academic Practice");
    expect(html).toContain("tag-pill");
    expect(html).not.toContain("class=\"chip\"");
    expect(html).not.toContain("·");
  });

  it("hides the row when only the eyebrow topic exists", () => {
    expect(readerTopicPillsHtml(["Philosophy Knowledge and Society"])).toBe("");
  });
});
