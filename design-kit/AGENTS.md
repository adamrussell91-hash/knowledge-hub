# Hub design kit — agent instructions

This folder is the design source of truth for Adam’s hub sites (Teaching, Life, Knowledge, Tasks, and any new hub). Read it **before** writing or restyling UI.

Tasks Hub agents: also read `TASKS.md` (Teaching chrome, board home, graph/charts borrowed from Knowledge and Life).

## Grab these files

1. `css/tokens.css` — closed palette, type, space, radius, elevation
2. `css/overlays.css` — the only per-hub differences (glass / tile density)
3. `css/actions.css` — `.btn`, Wave `:focus-visible`, `.confirm-card` (import in existing hubs)
4. `css/sign-in.css` — passphrase gate (brand, Sign in, labelled field)
5. `css/chrome.css` — rail, page header, buttons, confirm cards (new hubs)
6. `snippets/` — copy the HTML, then wire behaviour (`shell.html`, `hub-utilities.html`, `sign-in.html`, `confirm-card.html`)

Canonical repo: `/Users/adamrussell/Projects/hub-design-kit`  
GitHub: https://github.com/adamrussell91-hash/hub-design-kit  
Each hub also has a copy at `design-kit/` so this workspace can see it.

## Locked (do not reinvent)

- Colours, type scale, spacing, radius, shadows
- Page header: uppercase eyebrow → `h1` title → optional supporting → actions on the right
- Left rail: `--rail-width`, depth→marine gradient, `--on-dark*` text
- Rail brand: `.hub-rail__brand` — single line, CSS `text-transform: uppercase`, `--text-2xs`. Copy is `"Teaching Hub"` / `"Life Hub"` / `"Knowledge Hub"` / `"Tasks Hub"`. No stacked `<br>`, no large title-case hero on the rail. Optional `.hub-rail__tagline` only.
- Chrome utilities: refresh and sign out are `.hub-icon-btn` icons in `.hub-utilities` at the **canvas top-right** (last child of `.page-header__actions`). Faded `--shallow` icons — never labelled pill `.btn`s on the rail or header. Snippet: `snippets/hub-utilities.html`.
- Buttons: `.btn` + `--primary` / `--secondary` / `--ghost` / `--decisive`
- Agent UX: propose → **confirm card** → apply. Never silent writes that look like a new UI kit
- Inter 400/500/600/700 only

## Allowed differences (`data-hub` on `<html>`)

| Hub | Overlay |
|-----|---------|
| `teaching` | More glass, more tiles |
| `tasks` | Clone of Teaching. Product brief: `TASKS.md` |
| `life` | Tiles, flatter (less blur, tighter gap) |
| `knowledge` | Less glass, fewer tiles, icon rail (`--rail-width: 5.75rem`) |

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

When editing a hub, replace local logout/refresh chrome with the kit pattern (after sync):

1. Rail brand → `.hub-rail__brand` (or map the hub’s brand class to the same token rules). Single line of copy `"… Hub"`; CSS uppercases it. Drop stacked `<br>` titles and large title-case rail heroes.
2. Sign out / refresh → copy `snippets/hub-utilities.html` into `.page-header__actions` (canvas top-right). Keep existing ids/data attributes if tests rely on them; change the markup to `.hub-icon-btn`.
3. Delete labelled pill logout styles on the rail (`.teacher-layout__logout`, `.rail__logout`, `.hub-rail__logout`, `.quiet-button` used as Sign out/Refresh).
4. Load `actions.css` (or `chrome.css`) so `.hub-icon-btn` is defined.

## New hub checklist

1. Copy `design-kit/` into the new repo (or run the sync script after adding the path).
2. `<html lang="en" data-hub="…">`
3. Load Inter, then `tokens.css`, `overlays.css`, `chrome.css`, then the hub’s own CSS.
4. Start from `snippets/shell.html`.
5. Hub-only CSS may add domain styles; it may not redefine `:root` colours or type.
