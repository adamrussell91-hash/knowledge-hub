import { topicKeywords } from "./keywordGraph";
import { escapeHtml } from "../lib/dom";
import type { Origin } from "../domain/page";
import { originPillsHtml } from "../origin/pills";

export type GraphPreviewNote = {
  pageId: string;
  title: string;
  excerpt: string;
  tags?: string[];
  origins?: Origin[];
};

export type GraphPreviewHandlers = {
  onOpen: (pageId: string) => void;
};

function topicPills(tags: string[]) {
  const topics = topicKeywords(tags).slice(0, 3);
  if (!topics.length) return "";
  return `<div class="tag-pills" aria-label="Tags">${topics
    .map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
    .join("")}</div>`;
}

export function mountGraphPreview(host: HTMLElement, handlers: GraphPreviewHandlers) {
  const card = document.createElement("article");
  card.className = "graph-preview note-preview";
  card.hidden = true;
  card.setAttribute("aria-label", "Note preview");
  host.appendChild(card);

  let current: GraphPreviewNote | null = null;

  card.addEventListener("click", event => {
    const open = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-open-note]");
    if (!open || !current) return;
    handlers.onOpen(current.pageId);
  });

  function show(note: GraphPreviewNote) {
    current = note;
    card.innerHTML = `
      <h2 class="graph-preview__title note-preview__title"></h2>
      ${originPillsHtml(note.origins ?? [])}
      ${topicPills(note.tags ?? [])}
      <p class="graph-preview__excerpt note-preview__summary"></p>
      <div class="note-preview__actions">
        <button class="btn btn--primary graph-preview__open" data-open-note type="button">Open full note</button>
      </div>
    `;
    card.querySelector<HTMLElement>(".graph-preview__title")!.textContent = note.title;
    card.querySelector<HTMLElement>(".graph-preview__excerpt")!.textContent = note.excerpt;
    card.hidden = false;
  }

  function clear() {
    current = null;
    card.hidden = true;
  }

  return { show, clear, el: card };
}
