# Hub marks — favicon only

The blue/orange tiles in `icons/` are the **browser-tab favicon**. They are not page chrome.

Do **not** render `.hub-mark`, `.sign-in__mark`, or any other copy of that tile on the sign-in card, page header, rail, or canvas. Agents kept putting it in the wrong place. It is gone.

## Where it goes

| Place | Markup |
|-------|--------|
| Browser tab / home screen | `<link rel="icon" href="…/icons/<hub>.svg" type="image/svg+xml">` |
| Signed-in canvas | **Nowhere.** Title is text. Refresh / sign out stay `.hub-icon-btn`. |
| Sign-in card | **Nowhere.** Haze + brand + title + field. |
| Left rail | **Nowhere.** Brand is text. Destination icons (Dashboard, Classes, …) stay. |

## Files (favicon)

| Hub | Tile |
|-----|------|
| Life | `icons/life-hub.svg` |
| Knowledge | `icons/knowledge.svg` |
| Teaching | `icons/teaching.svg` |
| Tasks | `icons/tasks.svg` |

Glyphs (`*-glyph.svg`) are unused now. Do not put them on the rail wordmark.

## Do not

- Add `<img class="hub-mark">` or `<img class="sign-in__mark">`
- Wrap the `h1` in `.page-header__title-row` just to park a tile
- Invent a seventh mark or recolour arcs
- Put the tile next to the title, after utilities, on the rail, or on the gate
