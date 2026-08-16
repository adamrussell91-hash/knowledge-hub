# HQE Quiz — Design Spec

**Date:** 2026-08-15  
**Status:** Ready to implement  
**Depends on:** `2026-08-15-revision-quiz-design.md`  
**Grounding:** Study Methods Highlight-Question-Explain

## Goal

An **HQE** tab on Quiz runs cover-and-explain on Q/A pairs already in Hub notes. Show the question, hide the source, Adam writes an explanation from memory, then sees his original explain. He self-grades. Vague answers should be Again. No model calls.

## Non-goals

- AI comparison of explanations
- Generating new questions from highlights
- Factual-only vs why/how split (Elaborative drill is later)

## Queue

Same FSRS scheduler as Sprint, filtered to `kind: "qa"` (harvested `Q:`/`Question:` + `A:`/`Answer:`/`Explain:` blocks). Harvest on start still runs so new Q/A in notes appear. Duration, area, tags, cram match Sprint.

Empty: “No HQE pairs in this scope. Add Q: / A: (or Question / Explain) blocks to notes.”

## UI

Modes: Sprint · HQE · Dump & Sort · Map.

Card: question, textarea, Reveal. After reveal: “Your explanation” and “From your notes”, then Again / Hard / Good / Easy. Copy: “If it was vague, Again.”

## Testing

Queue `kinds: ["qa"]` drops definitions and heading claims.
