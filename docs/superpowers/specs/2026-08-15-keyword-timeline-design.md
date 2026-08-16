# Keyword timeline — Design Spec

**Date:** 2026-08-15  
**Status:** Approved design, ready for implementation planning  
**Replaces:** Parked belief/idea timeline (never shipped in this repo)  
**Component:** Knowledge Hub workplace. New rail beside Graph. Not a research brief and not the keyword constellation.

## Goal

Search the archive for a topic (for example “self determination theory”) and see matching notes on a **smooth, chronological timeline**. Click a node to open that note in the existing reader.

## Non-goals

- Replacing or changing the Graph rail
- Vector / hybrid search (Research already does that)
- Belief revision overlays, “I used to think…” annotations, or version diffs
- Editing dates, dragging nodes, or persisting layout
- Fetching every page body to recover dates
- A dedicated timeline HTTP endpoint
- Auto-playing a tour of the notes

## Approaches

1. **Search-driven DOM timeline rail (chosen).** New Timeline rail. Reuse `searchPages` / `rankByQuery`. Plot by `created_at` on the manifest. Real buttons, CSS enter animation, existing `openPage`.
2. **Reuse the Graph canvas.** Force layout has no time axis; nodes are not buttons; dates are not in the graph model. Rejected.
3. **New timeline API + embeddings.** Duplicates search and blocks local Vite preview. Rejected.

## Surfaces

Knowledge Hub rail: **Archive · Uni · Notes · Graph · Timeline · Research · Quiz**.

Timeline is its own view. Graph still filters the list by keyword; Timeline is a **query**, not a tag click-through.

Idle (empty query): search field and a short empty state (“Search a topic to see when those notes landed”). No all-notes dump.

After a query: count, date span, horizontal axis, one node per matching note. Area chips All / University / Notes filter the hits the same way the archive list does.

## Data

`PageManifestEntry` gains optional `created_at` (ISO datetime). Old manifests without it still parse.

`toManifestEntry` copies `page.created_at`. Local Vite listing must not strip the field. Fixture seed already has dates.

Missing dates: those notes sit in an **Undated** cluster at the left of the axis (`t = 0`), labeled Undated. They still open on click.

Search: existing substring match on title, excerpt, and tags. Then **sort oldest → newest** by `created_at` (undated first). Do not re-rank by title after that — time is the order.

Cap display at **120** notes (newest 120 of the filtered match set). If truncated, show “Showing 120 of N”. Stagger animation for at most the first 24 nodes; the rest appear with the last delay.

## Layout

Horizontal axis, oldest left, newest right. Overflow-x scroll. Year ticks if the span is ≥ 3 years; otherwise month ticks; if the span is under 60 days, day ticks.

Same calendar day: same `t`, increasing **lane** so labels stack above the axis (lane 0 closest to the line).

Each node is a `<button>` (≥ 44px hit target) with title and a short date (`Jan 2024`). Click / Enter calls the existing `openPage(id)` path.

## Motion

Nodes fade and rise (`280ms`, `ease`, `40ms` stagger via `--i`). The axis line scales from the left once per search. `prefers-reduced-motion: reduce` disables both; nodes are visible immediately.

No canvas. No d3-force.

## Architecture

```
src/timeline/build.ts     pure: hits → nodes, ticks, truncated count
src/timeline/mount.ts     DOM: search results stage, animation class, click
src/main.ts               view "timeline", rail button, search + area chips
src/domain/page.ts        optional created_at on manifest
dataRepo.toManifestEntry  include created_at
src/api/localData.ts      pass created_at through
src/style.css             .timeline-* Warm Cotton tokens
```

No new Netlify function. `searchPages` already returns manifest rows.

## Error / empty

- Empty query: idle copy, no axis.
- Query with zero hits: “No notes match.”
- Search throw: existing toast pattern, stay on Timeline.

## Testing

- `toManifestEntry` includes `created_at`; `parseManifest` still accepts rows without it.
- `buildTimeline` sorts dated notes, parks undated at `t = 0`, assigns lanes for the same day, emits ticks, truncates to 120 newest.
- Mount: clicking a node calls `onPageClick` with that id (jsdom).
- `rankByQuery` unchanged (existing search tests).
