# Closed-list tag remapping + Tidy push fix

## Goal

1. Midnight Tidy must land its writes when Curator (or a Save) pushes `knowledge-hub-data` in the same window.
2. Remap every live archive note onto the closed 20-tag list **without** a full Tidy body rewrite.

## 1. Tidy / Curator push race

Root cause: both workflows use cron `17 14 * * *`. Last night Tidy remapped 20 notes, committed, then `git push` was rejected. Neither job retries.

- Tidy cron → `47 14 * * *` (00:47 AEST). Curator stays `17 14 * * *`.
- Both data-repo checkouts: `fetch-depth: 0`.
- Shared `scripts/push-data-repo.sh`: fetch, `pull --rebase`, push; up to 3 attempts.
- Tidy behaviour unchanged: Haiku body rewrite, 20 notes/night, Clean Up button untouched.

## 2. One-shot Haiku retag

Tags only. No body rewrite. Does not write `_tidy` state.

- Candidates: every `manifest.json` page whose topic tags are missing or not all on `TOPIC_VOCABULARY`. Structural-only pages are candidates (title + excerpt still classify).
- Skip pages whose topic tags are already only closed-list names.
- Model: `claude-haiku-4-5`. Input: title, excerpt (manifest excerpt, else `excerptFromTidyBody`), current tags.
- Output: `{"tags":["…"]}` only. Map through `applyTopicTags` (structural kept, unknown dropped, cap 3).
- Invalid output: retry once, then leave the page unchanged and log.
- Budget: abort further model calls if estimated spend would exceed **$10** (Haiku $1 / $5 per MTok).
- Writes `pages/{id}.json` + `manifest.json`. One commit: `Map topic tags onto the closed vocabulary.`
- CLI: `npm run retag -- --data-dir data-repo`. Optional `--id`. Actions: `workflow_dispatch` only.

## Tests

- `needsRetag`: skip closed-list-only; retag old labels or no topics.
- `parseRetagProposal`: closed-list tags; reject empty / unknown-only / garbage.
- `runRetag`: apply + keep structural + update manifest; no body rewrite; retry once; leave unchanged after two failures; stop at $10.
- `parseRetagArgs`: `--data-dir` / `--id`.

## Out of scope

- Dictionary-only remap.
- Full Tidy rewrite of the archive.
- Life Hub / other hubs.
- Changing `TOPIC_VOCABULARY`.
- Marking notes as tidied.
