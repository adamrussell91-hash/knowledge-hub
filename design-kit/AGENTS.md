# Hub design kit — agent instructions

This folder is the design source of truth for Adam’s hub sites (Teaching, Life, Knowledge, Tasks, and any new hub). Read it **before** writing or restyling UI.

Tasks Hub agents: also read `TASKS.md` (Teaching chrome, board home, graph/charts borrowed from Knowledge and Life).

Rail work: also read `RAIL.md`. The left rail is locked — one width, brand goes home, icon + label rows.

Hub marks: also read `ICONS.md`. The website tile is favicon + login + canvas top-right. No login supporting copy.

## Grab these files

1. `css/tokens.css` — closed palette, type, space, radius, elevation
2. `css/overlays.css` — the only per-hub differences (glass / tile density)
3. `css/actions.css` — `.btn`, Wave `:focus-visible`, `.confirm-card` (import in existing hubs)
4. `css/sign-in.css` — **locked** passphrase gate (same on every hub)
5. `css/rail.css` — **locked** left rail (also imported by `chrome.css`)
6. `css/chrome.css` — rail, page header, buttons, confirm cards (new hubs)
7. `icons/` — locked hub tiles + glyphs (`ICONS.md`)
8. `snippets/` — copy the HTML, then wire behaviour (`shell.html`, `rail.html`, `hub-utilities.html`, `sign-in.html`, `sign-in.js`, `confirm-card.html`)

### Passphrase gate (mandatory)

Every hub’s front loading / password page uses `snippets/sign-in.html` + `css/sign-in.css` + `.btn` from `actions.css`. Do not invent a parallel login layout.

| Locked | Per-hub only |
|--------|----------------|
| Structure, classes, field label `Passphrase`, title `Sign in`, submit `Sign in` | Brand eyebrow text (`Life Hub`, …) |
| Page wash + card glass (not `data-hub` overlays) | Hub **tile** (`.sign-in__mark` from `icons/`) |
| Input `id="sign-in-passphrase"` | Auth wiring / API |
| **Enter submits** — `<form novalidate>`, button `type="submit"`, listen to `submit` | `snippets/sign-in.js` `wireSignIn` (or the same pattern) |

No supporting line, purpose copy, privacy notes, extra rows, or hub-only login CSS. The kit tile is the only mark.

Do **not** bind only to the button’s `click`. Do **not** put `onsubmit="return false"` on the form (that eats Enter). `novalidate` is required so a password-manager fill still reaches JS on Enter.

### Left rail (mandatory)

Every hub uses `snippets/rail.html` + `css/rail.css`. Full rules: `RAIL.md`.

| Locked | Per-hub only |
|--------|----------------|
| `--rail-width: 15rem` (never override, including Knowledge) | Which destinations appear |
| Brand is `<a class="hub-rail__brand">` to that hub’s **home** | Home `href` (Dashboard / Home / Archive / Board) |
| Primary items: 18px outline icon + title-case label | Icon paths and labels |
| `--on-dark*` markers — **no coloured dots**, no icon stacks | Optional tagline, Teaching search, shortcut section, status line |

No per-hub rail width, no stacked wordmark, no logo on the brand, no mixing dots and icons.

Canonical repo: `/Users/adamrussell/Projects/hub-design-kit`  
GitHub: https://github.com/adamrussell91-hash/hub-design-kit  
Each hub also has a copy at `design-kit/` so this workspace can see it.

## Locked (do not reinvent)

- Colours, type scale, spacing, radius, shadows
- Page header: uppercase eyebrow → `h1` title → optional supporting → actions on the right
- Left rail: `--rail-width` 15rem, depth→marine gradient, `--on-dark*` text. Same labeled rail on every hub — see `RAIL.md`
- Rail brand: `.hub-rail__brand` — **`<a>` to hub home**, single line, CSS `text-transform: uppercase`, `--text-2xs`. Copy is `"Teaching Hub"` / `"Life Hub"` / `"Knowledge Hub"` / `"Tasks Hub"`. No stacked `<br>`, no logo, no large title-case hero. Optional `.hub-rail__tagline` only.
- Rail items: `.hub-rail__link` = outline icon + title-case label. No coloured dots. No icon-over-label stacks. No `text-transform: uppercase` on item labels.
- Hub mark: the **tile** from `icons/` is the website icon. Favicon, `.sign-in__mark` on the gate, and `.hub-mark` at the canvas **top-right** (after `.hub-utilities`). Not on the rail. See `ICONS.md`.
- Chrome utilities: refresh and sign out are `.hub-icon-btn` icons in `.hub-utilities` at the **canvas top-right**. Faded `--shallow` icons — never labelled pill `.btn`s on the rail or header. Snippet: `snippets/hub-utilities.html`.
- Buttons: `.btn` + `--primary` / `--secondary` / `--ghost` / `--decisive`
- Agent UX: propose → **confirm card** → apply. Never silent writes that look like a new UI kit
- Inter 400/500/600/700 only

## Allowed differences (`data-hub` on `<html>`)

| Hub | Overlay |
|-----|---------|
| `teaching` | More glass, more tiles |
| `tasks` | Clone of Teaching. Product brief: `TASKS.md` |
| `life` | Tiles, flatter (less blur, tighter gap) |
| `knowledge` | Less glass, fewer tiles |

Overlays change **canvas** glass and tile density only. They do not change `--rail-width` or rail item layout.

Product UI (graphs, lesson blocks, bloods) stays in the hub. Chrome does not.

## Hard rules

- If a size/colour is missing, **pick the nearest token**. Do not add a new CSS variable unless you are editing this kit on purpose.
- Do not copy hex from an old screenshot. Use tokens.
- Do not start a new palette, font, or button style “just for this page”.
- High Sea (`--high-sea`) is accent / decisive, not body text on orange, not focus rings (focus is Wave).
- After changing this kit, run `scripts/sync-to-hubs.sh` so hub copies update.
- **Never store repos or data under `~/Documents` or `~/Desktop` (iCloud).** Code lives in `~/Projects/<name>` or `~/Teaching Hub`. Archives/media go to Cloudflare R2. If this workspace is under Documents, stop and relocate.
- **Hub sites must never need iCloud or any local Mac file to work.** Source is GitHub; runtime data is Cloudflare (Workers, R2, KV, D1). Do not add a required local-file fallback.

## Adopt in existing hubs

When editing a hub, replace local logout/refresh chrome **and** the left rail with the kit pattern (after sync):

1. Rail brand → `<a class="hub-rail__brand" href="…home…">`. Single line of copy `"… Hub"`; CSS uppercases it. Drop stacked `<br>` titles, logos, and large title-case rail heroes. Clicking the brand always returns to that hub’s home.
2. Rail destinations → `.hub-rail__link` (outline icon + title-case label). Replace coloured dots. Knowledge drops the narrow icon column and uses the 15rem labeled rail.
3. Sign out / refresh → copy `snippets/hub-utilities.html` into `.page-header__actions` (canvas top-right). Keep existing ids/data attributes if tests rely on them; change the markup to `.hub-icon-btn`. Add `.hub-mark` (that hub’s tile) after the utilities. Point `<link rel="icon">` at the same tile. Drop `.sign-in__supporting` and any login purpose copy.
4. Delete labelled pill logout styles on the rail (`.teacher-layout__logout`, `.rail__logout`, `.hub-rail__logout`, `.quiet-button` used as Sign out/Refresh).
5. Load `rail.css` (or `chrome.css`) and `actions.css` so `.hub-rail__*` and `.hub-icon-btn` are defined.
6. Delete hub CSS that overrides `--rail-width` or restyles rail markers.

## New hub checklist

1. Copy `design-kit/` into the new repo (or run the sync script after adding the path).
2. `<html lang="en" data-hub="…">`
3. Load Inter, then `tokens.css`, `overlays.css`, `chrome.css` (includes `rail.css`), then the hub’s own CSS.
4. Start from `snippets/shell.html` + `snippets/rail.html` + `snippets/sign-in.html`.
5. Favicon, `.sign-in__mark`, and `.hub-mark` all use that hub’s tile from `icons/`.
6. Hub-only CSS may add domain styles; it may not redefine `:root` colours or type, or override `--rail-width`.
