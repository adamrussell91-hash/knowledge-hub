# Hub marks — locked

Every hub uses **one** instrument from `icons/`. Wave arcs, cardinal gaps, High Sea core. No colour outside the closed palette. Do not redraw a logo.

Read this before adding a favicon, a sign-in mark, or a header glyph.

## Files

| Hub | Tile (website) | Glyph (dark / transparent) |
|-----|----------------|----------------------------|
| Life | `icons/life-hub.svg` | `icons/life-hub-glyph.svg` |
| Knowledge | `icons/knowledge.svg` | `icons/knowledge-glyph.svg` |
| Teaching | `icons/teaching.svg` | `icons/teaching-glyph.svg` |
| Tasks | `icons/tasks.svg` | `icons/tasks-glyph.svg` |
| Careers | `icons/careers.svg` | `icons/careers-glyph.svg` |
| Central Control | `icons/central-control.svg` | `icons/central-control-glyph.svg` |

**Tile** = Depth→Marine rounded square + mark. This **is** the website icon.

**Glyph** = the same mark without the square (for a dark field). Do not put it on the rail wordmark.

## Where it goes

| Place | File | Markup | Size |
|-------|------|--------|------|
| Browser tab / home screen | Tile | `<link rel="icon" href="…/icons/<hub>.svg" type="image/svg+xml">` | browser |
| Sign-in card | Tile | `<img class="sign-in__mark" src="…/icons/<hub>.svg" alt="" width="56" height="56">` | `3.5rem` |
| Signed-in canvas, **top-right** | Tile | `<img class="hub-mark" …>` last child of `.page-header__actions` (after `.hub-utilities`) | `2rem` |

`alt=""` — the brand text / page title already names the hub.

## Sign-in

Mark + brand eyebrow + title `Sign in` + passphrase + submit. Enter on the field must submit (form `submit`, not a click-only button).

**No supporting line.** No purpose copy, privacy notes, taglines, or “private dashboard” sentences on the gate. That writing does not belong there.

## Not on the rail

The left rail brand stays a text `<a class="hub-rail__brand">` to home. The hub tile/glyph is **not** a rail logo. See `RAIL.md`.

## Do not

- Invent a seventh mark or recolour arcs
- Use the glyph as the favicon or login mark on the light wash
- Place the tile on the rail
- Add descriptive copy under the login mark
