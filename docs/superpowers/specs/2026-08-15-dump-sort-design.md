# Dump and Sort — Design Spec

**Date:** 2026-08-15  
**Status:** Approved for implementation (slice 2 of the retrieval engine)  
**Depends on:** `2026-08-15-revision-quiz-design.md`  
**Grounding:** Study Methods “Brain Dump then Sort”; widget `Classroom-Tools/braindump-sort-prioritise.html`

## Goal

A Dump and Sort session is the mechanism that **seeds the understanding graph**. Adam dumps from memory (black), checks notes and marks gaps (blue), connects nodes, then every blue gap becomes an **untested** quiz item. No model tokens.

## Non-goals

- Sort-then-dump reverse
- AI grading or auto-filling blue nodes from the archive
- Showing note bodies during the dump phase (that would turn retrieval into rereading)
- Playfair/ink as a second app chrome (nodes keep black/blue; page chrome stays Warm Cotton)
- Persisting the canvas layout as a first-class graph view (later)

## Approaches

1. **Port the widget into the Quiz rail (chosen).** Same four phases, timer, black/blue, connect, priority copy. Finish writes gaps into the existing quiz store.
2. **Iframe the GitHub widget.** Fast, no graph write-back, second origin/visual system. Rejected.
3. **Text-only dump textarea.** Cheap, loses the connection/priority work the widget already does. Rejected.

## Session

Quiz home gains mode tabs: **Sprint** | **Dump & Sort**.

Start form: topic (required), area, optional tags (copied onto new items), timer default 10 minutes.

Phases (locked forward like the widget):

0. **Dump** — click canvas to add black nodes; double-click to edit; drag; delete. Center node is the topic. Notes stay closed.
1. **Check** — new clicks are blue gaps. He may now open the archive in another rail; this canvas stays.
2. **Connect** — click two nodes to draw an edge; optional edge label.
3. **Priorities** — same scoring as the widget (gap–gap cluster, known–gap bridge, isolated). **Save gaps to quiz** creates items.

## Write-back

Each blue node with non-placeholder text becomes:

```ts
kind: "gap"
cue: "What is missing: {node text}?"
answer: "Gap from Dump and Sort on {topic}."
page_id: "page_hub_dump_{fnv1a64(topic)}"  // synthetic page file, not a Hub note
status: "untested"
tags/area: from the start form
```

Reuse `saveQuiz`. Black nodes are not cards. Edges are not stored in v1.

## Token budget

Zero model calls. Timer, canvas, and save are local.

## Testing

- `gapsToQuizItems` skips center/black/empty/placeholder “Gap”
- Stable ids for the same topic + cue
- Save path reuses quiz merge
