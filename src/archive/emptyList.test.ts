import { describe, expect, it } from "vitest";
import { archiveEmptyHtml } from "./emptyList";

describe("archiveEmptyHtml", () => {
  it("shows a New-note empty state when the archive has no pages", () => {
    const html = archiveEmptyHtml({ hasArchiveNotes: false });
    expect(html).toContain("No notes yet");
    expect(html).toContain("From a book");
    expect(html).not.toContain("University");
    expect(html).not.toContain("migrate");
    expect(html).not.toContain("Notion");
  });

  it("uses matching-pages copy once notes exist", () => {
    expect(archiveEmptyHtml({ hasArchiveNotes: true })).toBe(`<p class="empty">No matching pages.</p>`);
  });
});
