import { describe, expect, it } from "vitest";
import { archiveEmptyHtml } from "./emptyList";

describe("archiveEmptyHtml", () => {
  it("shows a New-note empty state when Notes are absent from the archive", () => {
    const html = archiveEmptyHtml({ area: "notes", notesInArchive: false });
    expect(html).toContain("No notes yet");
    expect(html).not.toContain("migrate");
    expect(html).not.toContain("Notion");
    expect(html).not.toContain("--area notes");
  });

  it("treats an empty Notes filter as no matches once Notes exist", () => {
    expect(archiveEmptyHtml({ area: "notes", notesInArchive: true })).toBe(
      `<p class="empty">No matching pages.</p>`,
    );
  });

  it("uses the same empty copy for University and All", () => {
    expect(archiveEmptyHtml({ area: "university", notesInArchive: true })).toBe(
      `<p class="empty">No matching pages.</p>`,
    );
    expect(archiveEmptyHtml({ area: "all", notesInArchive: false })).toBe(
      `<p class="empty">No matching pages.</p>`,
    );
  });
});
