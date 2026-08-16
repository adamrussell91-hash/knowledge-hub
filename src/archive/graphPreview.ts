export type GraphPreviewNote = {
  pageId: string;
  title: string;
  excerpt: string;
};

export type GraphPreviewHandlers = {
  onOpen: (pageId: string) => void;
};

export function mountGraphPreview(host: HTMLElement, handlers: GraphPreviewHandlers) {
  const card = document.createElement("div");
  card.className = "graph-preview";
  card.hidden = true;
  card.innerHTML = `
    <div class="graph-preview__body">
      <p class="graph-preview__title"></p>
      <p class="graph-preview__excerpt"></p>
    </div>
    <button class="graph-preview__open" data-open-note type="button" aria-label="Read full note">
      <span aria-hidden="true">↑</span>
    </button>
  `;
  host.appendChild(card);

  let current: GraphPreviewNote | null = null;
  const titleEl = card.querySelector<HTMLElement>(".graph-preview__title")!;
  const excerptEl = card.querySelector<HTMLElement>(".graph-preview__excerpt")!;
  const openBtn = card.querySelector<HTMLButtonElement>("[data-open-note]")!;

  openBtn.onclick = () => {
    if (current) handlers.onOpen(current.pageId);
  };

  function show(note: GraphPreviewNote) {
    current = note;
    titleEl.textContent = note.title;
    excerptEl.textContent = note.excerpt;
    card.hidden = false;
  }

  function clear() {
    current = null;
    card.hidden = true;
  }

  return { show, clear, el: card };
}
