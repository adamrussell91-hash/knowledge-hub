# Left rail — locked chrome

The left rail is **the same component on every hub**. Glass/tile overlays may change the canvas. They must not change rail width, brand behaviour, item markers, or type.

Read this before adding or restyling a rail destination. Snippet: `snippets/rail.html`. CSS: `css/rail.css` (also pulled in by `chrome.css`).

## Locked (do not reinvent)

| Piece | Rule |
|--------|------|
| Width | `--rail-width` is **15rem** in `tokens.css`. Do not override it in a hub sheet or in `overlays.css`. Knowledge does **not** get a narrow icon rail. |
| Fill | Depth → Marine vertical gradient. Text and icons use `--on-dark*` only. |
| Brand | One line, CSS uppercase, `--text-2xs`. Copy is `"Teaching Hub"` / `"Life Hub"` / `"Knowledge Hub"` / `"Tasks Hub"`. |
| Brand click | `.hub-rail__brand` is an **`<a>` to that hub’s home**. From any page, it returns to the same route as the first primary item (Dashboard / Home / Archive / Board). It is not a collapse control and not plain text. |
| Item layout | Horizontal row: **18px outline icon** + **title-case label**. Icon left, label right. |
| Item markers | Stroke icons in `--on-dark` / `--on-dark-muted`. **No coloured dots.** No filled brand marks. No mixing dots and icons in one list. |
| Item type | `--text-sm`, `--weight-medium`, title case (`Home`, `Archive`). CSS must **not** uppercase nav labels. Brand and section headings are the only uppercase micro lines. |
| Current page | `aria-current="page"` (optional `.is-current`). Highlight is `--on-dark-hover` behind the row, `--on-dark` type. Not a second accent colour. |
| Utilities | Refresh and sign out stay in the **canvas** header (`.hub-utilities`). Never on the rail. |

## Anatomy

```
┌─ .hub-rail (15rem, depth→marine) ─────────┐
│  .hub-rail__brand  →  hub home            │
│  .hub-rail__tagline (optional)            │
│  .hub-rail__search  (optional, Teaching)  │
│  .hub-rail__nav                           │
│     .hub-rail__link  [icon] Label         │
│     .hub-rail__section  (optional)        │
│     .hub-rail__link  [icon] Label         │
│     .hub-rail__link--plain  Shortcut      │
│  .hub-rail__status  (optional, mt auto)   │
└───────────────────────────────────────────┘
```

Copy `snippets/rail.html`. Do not invent a parallel aside.

## Brand → home

| Hub | Brand copy | `href` goes to |
|-----|------------|----------------|
| Teaching | `Teaching Hub` | Dashboard (that hub’s `/` or `/dashboard`) |
| Life | `Life Hub` | Home |
| Knowledge | `Knowledge Hub` | Archive |
| Tasks | `Tasks Hub` | Board |

- Markup: `<a class="hub-rail__brand" href="…">Life Hub</a>` inside `.hub-rail__brand-block`.
- No logo, concentric mark, hub tile, or stacked `<br>` wordmark beside or above the brand. The website tile lives top-right and on sign-in (`ICONS.md`).
- No collapse chevron attached to the brand. If a hub collapses the rail, that control is a separate `.hub-icon-btn`, not the wordmark.
- Optional `.hub-rail__tagline` is not a link (e.g. Life’s “Private dashboard”).

## Primary destinations

Every first-class page in the rail is `.hub-rail__link`:

- `<a>` (or `<button class="hub-rail__link">` in an SPA). Same class, same row chrome.
- First child: `<svg class="hub-rail__icon">` — `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="1.75"`, displayed at **1.125rem**.
- Label in title case, not `text-transform: uppercase`.
- Idle colour `--on-dark-muted`; hover / current `--on-dark`.
- Row min-height `2.5rem`, padding `--space-2` `--space-3`, radius `--radius-sm`.

**Forbidden**

- Coloured dots, pastel chips, or domain swatches as the marker (Life Nutrition / Fitness / Body / Mind / Skincare use **icons**, same as Home).
- Icon stacked above the label (Knowledge’s old icon rail).
- Icon-only columns, or a second rail width to “make icons fit”.
- Text-only primary pages (Calendar, Central Node, Graph, Quiz, …).
- Mixing marker types in the primary list.

Domain colour belongs on the **canvas** (tiles, charts, chips), not on the rail.

## Sections and shortcuts

Optional `.hub-rail__section` — uppercase micro, `--text-2xs`, `--on-dark-muted` (`Domains`, `Your classes`).

Instance shortcuts under a section (Teaching class codes) may use `.hub-rail__link.hub-rail__link--plain` (no icon). Same row height and padding. Still no dots.

If the row is a **page** (Nutrition, Graph, Calendar), it is not a shortcut — it gets an icon.

## Optional chrome (same classes if present)

| Optional | Class | Notes |
|----------|--------|------|
| Tagline | `.hub-rail__tagline` | One quiet line under the brand. |
| Search | `.hub-rail__search` | Teaching only. Sits under the brand. On-dark field, same inset as nav. Do not invent a second search look. |
| Status | `.hub-rail__status` | e.g. “Private · live sync”. `--text-2xs`, `--on-dark-muted`, `margin-top: auto`. Not a second brand. |

Do not add a rail footer of labelled buttons, avatar blocks, or sign-out pills.

## Per-hub overlay — not the rail

`html[data-hub]` may change glass and tile density on the canvas. It may **not** change `--rail-width`, brand type, item layout, or markers.

| Hub | Canvas overlay | Rail |
|-----|----------------|------|
| Teaching / Tasks | More glass, more tiles | Locked labeled rail |
| Life | Tiles, flatter | Locked labeled rail |
| Knowledge | Less glass, fewer tiles | Locked labeled rail — **not** an icon column |

Tasks clones Teaching. See `TASKS.md`.

## Adopt in an existing hub

1. Load `css/rail.css` (or `chrome.css`, which imports it).
2. Replace the aside with `snippets/rail.html`. Keep existing `href`s / ids if tests rely on them.
3. Make the brand an `<a>` to home. Drop stacked titles, logos, and brand-adjacent chevrons.
4. Give every primary destination an outline icon + title-case label. Replace coloured dots.
5. Delete hub CSS that sets `--rail-width`, uppercases nav labels, stacks icon-over-label, or paints rail markers in domain colours.
6. Move refresh / sign out to `.hub-utilities` if they are still on the rail.

Companion notes: `migrations/rail-consistency/README.md`.
