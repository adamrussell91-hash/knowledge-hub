# Tasks Hub — agent design notes

Read `AGENTS.md` first. This file is the extra brief for **Tasks Hub only**. It does not unlock a new palette, type scale, rail, or button system.

Chrome is Teaching. Product surfaces (board, graph, charts) stay in the hub. Data models and persistence are out of scope here.

Canonical kit: `/Users/adamrussell/Projects/hub-design-kit`  
Tasks Hub: `/Users/adamrussell/Projects/tasks-hub`

## Shell

```html
<html lang="en" data-hub="tasks">
```

Load Inter, then kit `tokens.css`, `overlays.css`, `chrome.css` (new hub), then Tasks Hub CSS.

`data-hub="tasks"` **clones Teaching**: more glass, more tiles, labeled left rail (not Knowledge’s icon rail). Values live in `css/overlays.css` — do not retune them in the hub.

Page header stays kit: uppercase eyebrow → `h1` → optional supporting → actions on the right.

Agent writes: propose → **confirm card** → apply.

## Surfaces

| Surface | Role |
|---------|------|
| **Board** | Home. Task / project / excursion cards as Teaching tiles (glass, `--hub-tile-gap`). |
| **Graph** | A rail page, not home. Two modes on that page: **blockers** (task nodes, blocked-by edges) and **workstreams** (clustered projects / areas). |
| **Charts** | Blocks on the board (counts, trends). Not a third chrome system. |

Status colour uses existing tokens only: Wave, Marine, Depth, pastel chips. High Sea is accent / decisive, never body text on orange, never focus rings.

## Borrow — do not redraw

Copy interaction and rendering from hubs that already have it. Restyle with kit tokens if a copied stylesheet hard-codes hex. Do not invent a Tasks graph library or a new chart look.

**Graphs (Knowledge Hub)**

- Force layout: `src/archive/forceGraph.ts`
- Focus / search / selection colouring: `src/archive/graphFocus.ts`
- Model shape (adapt nodes/edges; do not keep note/keyword semantics): `src/archive/keywordGraph.ts`

Use Knowledge’s habits: search field, select a node, preview card. Universe / fake-sun modes are Knowledge product, not a Tasks requirement.

Path: `/Users/adamrussell/Projects/knowledge-hub`

**Charts (Life Hub)**

- Kit root: `js/app/chart-kit/`
- Prefer **ring**, **columns**, **area-line** for board metrics. Reach for heatmap / pie / sankey / etc. only when the same chart type already exists there and fits the data.

Path: `/Users/adamrussell/Projects/life-hub`

Graph and chart CSS belongs in the hub (or a copy of those modules). Do not add viz packages to this design-kit repo in this pass.

## Hard rules

- Do not fork `--rail-width` to the Knowledge icon rail.
- Do not flatten glass to Knowledge/Life’s `glass-panel` override. Tasks keeps Teaching frost.
- Do not start a Tasks colour story “because work is serious.”
- If a size or colour is missing, pick the nearest token.
