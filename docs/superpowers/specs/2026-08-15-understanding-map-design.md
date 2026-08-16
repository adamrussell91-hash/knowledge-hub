# Understanding map — Design Spec

**Date:** 2026-08-15  
**Status:** Ready to implement  
**Depends on:** `2026-08-15-revision-quiz-design.md`, `2026-08-15-dump-sort-design.md`

## Goal

A **Map** tab on Quiz shows the live status of quiz items: what has been tested, what is still grey, what has decayed or failed. It reads `quiz/schedule.json` (or localStorage). No model calls.

This is not the Archive keyword graph. That graph is thematic. This one is verified vs untested knowledge.

## Non-goals

- Drawing Dump and Sort edges (not stored yet)
- Cross-domain “same structure” suggestions
- Deadline weighting
- A new rail button
- HQE AI grading

## Colour

- **Black** — verified
- **Blue** — untested
- **Orange** — decaying or failed

## UI

Quiz modes: **Sprint · Dump & Sort · Map**.

Map: area + tag filters (same as Sprint). Four clusters with counts: untested, decaying, failed, verified. Each item is a pill with `cue_preview`. Empty schedule: “Run a sprint or Dump and Sort first.”

Click a pill to pin its preview. No navigation into a missing Hub page for synthetic dump items.

## Testing

Filter by area/tags; colour mapping; grouping includes every status even when empty.
