import { describe, expect, it } from "vitest";
import { extractLocalLinks, isBinaryAttachment, pageTitle, titleFromMarkdown } from "./migrate-notion";

describe("extractLocalLinks", () => {
  it("keeps relative attachments and ignores web links", () => {
    expect(extractLocalLinks("[Paper](Reading%20note/paper.pdf) ![Image](Reading%20note/chart.png) [Web](https://example.com)")).toEqual(["Reading note/paper.pdf", "Reading note/chart.png"]);
  });
  it("preserves malformed percent encoding without failing", () => {
    expect(extractLocalLinks("[File](bad%name.pdf)")).toEqual(["bad%name.pdf"]);
  });
  it("does not treat cross-linked Markdown pages as attachments", () => {
    expect(isBinaryAttachment("linked-page.md")).toBe(false);
    expect(isBinaryAttachment("reading.pdf")).toBe(true);
  });
  it("derives a readable title while retaining the page id separately", () => {
    expect(pageTitle("Cognitive Science 13bf794f8476804e9285e85ecca5900b.md")).toBe("Cognitive Science");
  });
  it("keeps attachment paths that contain parentheses", () => {
    expect(extractLocalLinks("[Paper](folder/(2021) paper.pdf)")).toEqual(["folder/(2021) paper.pdf"]);
  });
  it("uses the first heading if a Notion export filename has no title", () => {
    expect(titleFromMarkdown("", "# University index\n\nContent")).toBe("University index");
  });
});
