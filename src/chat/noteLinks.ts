import { renderMarkdown } from "../lib/markdown";
import { pageHashForId } from "../routing/pageHash";
import { escapeHtml } from "../lib/dom";

export const ARCHIVE_PAGE_ID = /\bpage_(?:notion|hub)_[a-z0-9_]+\b/gi;
export const ARCHIVE_PAGE_ID_EXACT = /^page_(?:notion|hub)_[a-z0-9_]+$/i;

export type NoteTitle = { pageId: string; title: string };

export function isArchivePageId(value: string): boolean {
  return ARCHIVE_PAGE_ID_EXACT.test(value.trim());
}

export function titlesFromNotes(notes: NoteTitle[] | undefined): Map<string, string> {
  const titles = new Map<string, string>();
  for (const note of notes ?? []) {
    if (!note.pageId || !note.title.trim()) continue;
    titles.set(note.pageId, note.title.trim());
  }
  return titles;
}

export function noteLinkHtml(pageId: string, label: string): string {
  return `<a class="note-link" href="${escapeHtml(pageHashForId(pageId))}" data-open-page="${escapeHtml(pageId)}">${escapeHtml(label)}</a>`;
}

function labelFor(pageId: string, titles: Map<string, string>): string {
  return titles.get(pageId) || "note";
}

function linkifyBareIds(chunk: string, titles: Map<string, string>): string {
  return chunk.replace(/(\()?(page_(?:notion|hub)_[a-z0-9_]+)(\))?/gi, (_full, _open, pageId: string) => {
    return `[${labelFor(pageId, titles)}](${pageId})`;
  });
}

/** Turn leftover page_notion_ / page_hub_ ids into [title](pageId) without touching existing links. */
export function rewriteBareArchiveIds(markdown: string, titles: Map<string, string> | NoteTitle[] = new Map()): string {
  const map = titles instanceof Map ? titles : titlesFromNotes(titles);
  return markdown
    .split(/(\[[^\]]+\]\([^)\s]+\))/g)
    .map(part => (/^\[[^\]]+\]\([^)\s]+\)$/.test(part) ? part : linkifyBareIds(part, map)))
    .join("");
}

export function renderChatMarkdown(markdown: string, notes?: NoteTitle[]): string {
  return renderMarkdown(rewriteBareArchiveIds(markdown, titlesFromNotes(notes)));
}
