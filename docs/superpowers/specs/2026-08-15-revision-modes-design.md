# Remaining revision modes — Design Spec

**Date:** 2026-08-15  
**Status:** Implemented  
**Covers:** dump connections on the Map, sort-then-dump, quote cloze, Why/How, interleaved exam sim

Token-free. No AI HQE grading. No deadline field.

## Dump connections

Saving a dump writes **black and blue** nodes as items (`known` / `gap`) plus **edges** `{ from, to, page_id }` into `quiz/schedule.json` (`edges` array). Replacing a topic replaces that topic’s edges. Map draws those edges on a board using saved x/y, in the same black/blue/orange status colours.

## Sort then dump

Dump **Sort→Dump** tab. If a dump snapshot exists for the topic, peek that organised map; otherwise peek harvested heading claims. Hide, then dump from memory on a blank canvas.

## Quote cloze

Harvest `>` blockquotes with enough long words. Cue blanks ~every other content word (length > 4). Queue `kind: "cloze"`.

## Why/How

**Why/How** tab. Same Q/A queue, keep cues matching `\b(why|how)\b`.

## Exam sim

Mixes all kinds, ignores due dates, default 30 minutes. Queue round-robins by kind so types do not clump.

## First-class tabs

Sprint · HQE · Why/How · Cloze · Exam · Dump · Sort→Dump · Map
