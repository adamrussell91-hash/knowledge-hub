export type ArchiveArea = "all" | "university" | "notes";

export function archiveEmptyHtml(input: {
  area: ArchiveArea;
  notesInArchive: boolean;
}): string {
  if (input.area === "notes" && !input.notesInArchive) {
    return `<div class="empty empty--panel">
              <h2>No notes yet</h2>
              <p>Use New note in the top bar to add one. University pages stay in the archive.</p>
            </div>`;
  }
  return `<p class="empty">No matching pages.</p>`;
}
