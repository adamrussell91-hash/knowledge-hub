# Graph modes — Show All and Universe View — Design Spec

**Date:** 2026-08-15  
**Status:** Approved design, ready for implementation planning  
**Component:** Knowledge Hub Graph rail. Extends the existing keyword constellation. Not the Quiz Map and not the Timeline.

## Goal

Keep today’s **Constellation** graph as the default. Add two modes on the same Graph surface:

1. **Show All** — honest, zoomed-out knowledge map: every note, keyword hubs as faint landmarks, lines where notes share tags.
2. **Universe View** — a separate playful mode that is allowed to cheat. A fake Hub sun pulses at the centre. Major keywords are planets. Sub-themes orbit those planets. Notes are moons. A note with several keywords appears as **twin moons** (one copy per planet). Motion must feel smooth and WOW (steady 60fps rails, cinematic camera in, no jitter).

Keyword search works the same in all three modes: matches stay coloured, everything else greys out. Nodes do not vanish.

## Non-goals

- Replacing Constellation as the default Graph
- 3D WebGL / planet textures / real n-body physics
- Wiki-links or citation edges (the archive is still tag-based)
- Jumping from a hub click into the Archive list (that current behaviour goes away)
- A new rail button
- Quiz Map, Timeline, or Research
- Persisting camera, layout, or Universe positions
- Audio, bloom shaders, or a guided “tour the galaxy” autoplay

## Approaches

1. **Shared chrome, two engines (chosen).** One toolbar, search dimmer, and preview card. Constellation + Show All share the existing canvas + d3-force path. Universe is a second engine: positions come from circular orbits on rails, not from force. Modes never run both loops at once.
2. **One canvas, three skins.** Universe is d3-force with rounder dots. Rejected: twin moons and gravity fight the current simulation; it will not feel WOW.
3. **Layout Show All once, then jitter nodes in place.** Rejected: nothing actually orbits its parent; twin moons have nowhere to live.

## Surfaces

Graph stays one rail destination. Archive viewbar stays **List | Graph**.

On Graph, a mode row in the same pattern as Quiz modes:

**Constellation · Show All · Universe**

One kit `.hub-search` field on the graph toolbar (in addition to any existing copy). Mode toggles are `.hub-pills`. Empty search = full colour. Non-empty = substring match on keyword label or note title; matches keep their colour; non-matches and their links go grey. Twin moons: if the note matches, **both** copies stay coloured.

## Shared overlay

Not owned by either engine:

- Hover tip (title / keyword + count)
- Selection dim (grey non-cluster)
- Pinned preview card when a **note** is selected: title + excerpt
- **Read full note** control on the right of that card: an arrow pointing up. Activates the existing `openPage` reader. Keyboard: Enter on a selected note also opens.

Click empty space: clear selection and preview.

## Clicks

| Target | Constellation | Show All | Universe |
| --- | --- | --- | --- |
| Note (moon / leaf) | Pin preview, grey the rest, up-arrow to open | Same | Same (all twin copies of that note stay coloured) |
| Keyword hub (planet / major or minor) | Keep today’s **expand constellation** (reveal that hub’s notes) | Grey-focus that system; do not expand; do not leave Graph | Grey-focus that star system (planet + its moons); do not leave Graph |
| Fake sun | n/a | n/a | No-op besides a slightly stronger pulse; not a note |

Never navigate to the keyword-filtered Archive list from the graph.

## Show All (honest)

Same canvas and d3-force family as Constellation, different model:

- **Keyword hubs** stay visible as smaller, fainter landmarks (majors smaller than today’s Constellation majors; minors smaller still).
- **Every note** is a unique node (no twin copies, no `LEAF_SAMPLE` cap).
- **Hub–note spokes** for each of the note’s topic keywords.
- **Note–note lines** when two notes share at least two topic keywords. Weight = shared topic-tag count. Draw only those edges, and keep the strongest 800 so the map cannot become a solid hairball. Thickness scales with weight.
- Camera starts more zoomed out than Constellation (`k` lower; fit the simulation bbox after a short settle).
- Labels: hubs always; note titles only above a zoom threshold.

Constellation is unchanged in data shape: 8 majors, owned minors, expand-to-reveal sampled leaves.

## Universe (cheat, must WOW)

Separate animation loop on the same `<canvas>` host. **No d3-force. No note–note lines.** Weak links are simply not drawn.

**Sun.** Decorative. Not a note, not in search. Centre of the canvas world. Faint sine pulse on radius/opacity (~0.6Hz, small amplitude). Warm gold, soft halo.

**Planets.** The current 8 major keywords. Sit on a wide ring around the sun, equally spaced, slow orbit (full revolution on the order of minutes, not seconds). Planet size scales with note count, but smaller than today’s Constellation majors.

**Sub-theme moons.** Minor keywords orbit their owner planet. Distance **inversely** follows co-occurrence weight with that major (stronger pair = closer). Each minor has its own period so systems do not lock in a rigid wheel.

**Note moons.** Each topic keyword on a note gets a copy of that note orbiting that keyword’s body (major planet or minor). That is the twin-moon cheat. Distance around parent P: closer when P is a larger share of the note’s topic tags (only-tag notes hug the planet; heavily multi-tagged notes sit farther out). Tiny radius. Slowest motion. No title until hover or zoom-in.

**Camera.** On entering Universe: ease from Constellation/Show All view into a wide pull-back centred on the sun (~800ms, ease-out). Pan/zoom still work after that. `prefers-reduced-motion: reduce`: skip the enter ease, freeze orbits at the initial angle, keep the pulse off. The spatial layout (sun / planets / moons) still appears.

**Performance.** Parametric positions each frame (`angle += speed * dt`). No physics integrator. If note copies exceed 1,500, keep the nearest N to the camera and fade the rest (still present for search colouring of labels at zoom). Target 60fps on the existing canvas 2d context.

## Architecture

```
src/archive/keywordGraph.ts     Constellation model (unchanged defaults)
src/archive/showAllGraph.ts     full note + hub + overlap-edge model (pure)
src/archive/universeGraph.ts    sun / planet / moon rails + twin copies (pure)
src/archive/graphFocus.ts       search + selection colouring (shared)
src/archive/graphPreview.ts     pinned card + up-arrow control (DOM)
src/archive/forceGraph.ts       Constellation + Show All (d3-force)
src/archive/universeView.ts     orbital rAF loop, pulse, enter camera
src/main.ts                     Graph mode state, mode row, search field, openPage
src/style.css                   mode row, preview card, up-arrow
```

`main.ts` holds `graphMode: "constellation" | "showAll" | "universe"`. Changing mode tears down the active mount and mounts the other engine with the current search string.

No new HTTP. Same page manifest as today’s graph.

## Error / empty

- Archive with no topic keywords: existing empty graph copy; mode row still visible, Universe shows only the pulsing sun.
- Search with zero matches: all nodes grey; toolbar says no matches. Do not empty the canvas.
- Preview for a note that fails to open: keep the card; reader error stays the reader’s problem.

## Testing

- `showAllGraph`: one node per note; two tags ⇒ two spokes; overlap edge only when weight ≥ 2; no duplicate note ids.
- `universeGraph`: fake sun present; majors = planets; a two-keyword note yields two moon copies with distinct parent ids; stronger co-occurrence ⇒ smaller minor radius; reduced-motion flag does not throw.
- `graphFocus`: search colours matching notes and **both** twin copies; greys the rest; empty search colours all.
- `graphPreview`: selecting a leaf shows card + up-arrow control; activating it calls the page-open callback; empty click clears.
- Force/Universe mounts: mode switch does not leave two rAF/sim loops (teardown test).

## Motion and accessibility

Warm Cotton where CSS is used (preview card). Canvas motion is custom. Reduced motion: freeze Universe orbits and skip enter ease; Show All still uses force settle (that is layout, not decoration). Hit targets for the preview button ≥ 44px.
