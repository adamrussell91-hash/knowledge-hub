import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, emphasis, and lists", () => {
    const html = renderMarkdown(`# Title

A **bold** and *italic* line.

- one
- two
`);
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>one</li>");
  });

  it("keeps external links clickable and softens local ones", () => {
    const html = renderMarkdown(`[Paper](https://example.com/a.pdf) and [Local](folder/file.pdf)`);
    expect(html).toContain('href="https://example.com/a.pdf"');
    expect(html).toContain('<span class="md-link">Local</span>');
  });
});
