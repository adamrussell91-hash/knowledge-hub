export type ArchiveArea = "all" | "university" | "notes";

export function archiveEmptyHtml(input: {
  area: ArchiveArea;
  notesInArchive: boolean;
}): string {
  if (input.area === "notes" && !input.notesInArchive) {
    return `<div class="empty empty--panel">
              <h2>Notes not migrated yet</h2>
              <p>Export the Notion Notes database, tidy with <code>prompts/notion-notes-tidy.md</code>, then run:</p>
              <pre>npm run migrate -- ~/path/to/Notes\\ Export --area notes</pre>
              <p>University pages stay in the archive; Notes merge into the same manifest.</p>
            </div>`;
  }
  return `<p class="empty">No matching pages.</p>`;
}
