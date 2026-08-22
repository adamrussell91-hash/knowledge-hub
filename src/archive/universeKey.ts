export type UniverseKeyItem = {
  id: string;
  title: string;
  meaning: string;
};

/** Hover labels and decorations from the Universe canvas, in reading order. */
export const UNIVERSE_KEY_ITEMS: readonly UniverseKeyItem[] = [
  {
    id: "sun",
    title: "Sun",
    meaning: "The Hub at the centre. Decorative glow — not a note.",
  },
  {
    id: "planet",
    title: "Planet",
    meaning: "A major topic. Bigger means more notes carry that tag.",
  },
  {
    id: "giant",
    title: "Gas giant",
    meaning: "The most connected topic: largest, with bands and a ring.",
  },
  {
    id: "ringed",
    title: "Ringed planet",
    meaning: "The next standout topic, wearing a dust ring.",
  },
  {
    id: "minor",
    title: "Minor planet",
    meaning: "A smaller topic orbiting the major it shares most with.",
  },
  {
    id: "moon",
    title: "Moon",
    meaning: "A cluster of notes that share the same tags.",
  },
  {
    id: "page",
    title: "Note",
    meaning: "A single note, orbiting its moon.",
  },
  {
    id: "rock",
    title: "Rock",
    meaning: "A note with no topic tags yet. Belt debris until it is tagged.",
  },
];

export const UNIVERSE_KEY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>
  <circle cx="12" cy="12" r="7.35"/>
  <circle cx="19.35" cy="12" r="1.35" fill="currentColor" stroke="none"/>
  <circle cx="7.15" cy="17.85" r="0.7" fill="currentColor" stroke="none"/>
</svg>`;

function itemRow(item: UniverseKeyItem) {
  return `<li class="universe-key__item">
    <span class="universe-key__swatch universe-key__swatch--${item.id}" aria-hidden="true">
      <span class="universe-key__dot"></span>
    </span>
    <span class="universe-key__copy">
      <strong class="universe-key__name">${item.title}</strong>
      <span class="universe-key__meaning">${item.meaning}</span>
    </span>
  </li>`;
}

export function universeKeyHtml(open: boolean) {
  const expanded = open ? "true" : "false";
  const label = open ? "Collapse universe key" : "Universe key";
  return `<aside class="universe-key glass-panel${open ? " is-open" : ""}" data-universe-key>
    <button
      type="button"
      class="universe-key__toggle"
      data-universe-key-toggle
      aria-expanded="${expanded}"
      aria-controls="universe-key-panel"
      aria-label="${label}"
      title="Universe key"
    >
      ${UNIVERSE_KEY_ICON}
      <span class="universe-key__title">Visual key</span>
    </button>
    <div class="universe-key__panel" id="universe-key-panel">
      <div class="universe-key__panel-inner">
        <p class="universe-key__lede">What each body means</p>
        <ul class="universe-key__list">
          ${UNIVERSE_KEY_ITEMS.map(itemRow).join("")}
        </ul>
      </div>
    </div>
  </aside>`;
}

export function setUniverseKeyOpen(key: HTMLElement, open: boolean) {
  const toggle = key.querySelector<HTMLButtonElement>("[data-universe-key-toggle]");
  key.classList.toggle("is-open", open);
  if (!toggle) return;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute("aria-label", open ? "Collapse universe key" : "Universe key");
}

export function bindUniverseKey(root: ParentNode, onToggle: (open: boolean) => void) {
  const key = root.querySelector<HTMLElement>("[data-universe-key]");
  if (!key) return;
  const toggle = key.querySelector<HTMLButtonElement>("[data-universe-key-toggle]");
  if (!toggle) return;

  toggle.onclick = () => {
    const next = !key.classList.contains("is-open");
    setUniverseKeyOpen(key, next);
    onToggle(next);
  };

  key.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !key.classList.contains("is-open")) return;
    event.stopPropagation();
    setUniverseKeyOpen(key, false);
    onToggle(false);
    toggle.focus();
  });
}
