# Knowledge Hub — Self-Maintaining Wiki (Curator) Design

**Date:** 2026-08-13  
**Status:** Approved for v1 implementation (copied into this repo 2026-08-15; restored 2026-08-16)  
**Parent spec:** original Knowledge Hub design §5b  
**Component:** background curator job + review queue UI

**Versions:** two. **v1** is linking proposals + the approve/dismiss queue. **Later** is duplicate detection and manual merge. There is no v3. Duplicate merge is explicitly not in v1.

## 1. What this solves

Every personal knowledge graph dies the same way: linking notes together is manual work, manual work gets skipped, and six months later the graph is a pile of unconnected nodes. This component removes that failure mode by having the system propose its own links, on a schedule, from new or changed notes — you approve or dismiss in batches instead of building links from scratch.

It has two jobs, which need to stay separate because they carry very different risk:

1. **Linking (v1)** — propose that note A relates to note B. Low risk, reversible, cheap to get wrong (a bad link just sits there unused).
2. **Duplicate detection (later)** — flag that note A and note B may be saying the same thing (e.g. the same idea captured in a 2022 notebook note and a 2026 university note). Higher risk, because merging is closer to deleting. This never happens automatically.

## 2. Trigger and scheduling

Runs as a **GitHub Actions workflow on the code repo** that checks out the private data repo, writes curator artifacts there, and pushes. Not a Netlify Scheduled Function (free Action minutes, no interference with Netlify invocation budget).

The original draft put the workflow *in* the data repo. The curator TypeScript lives here, so the Action lives here and commits `_curator/*` plus any `connected` cleanup into `knowledge-hub-data`.

- **Cadence:** nightly, plus an on-demand **Run now** button that fires `workflow_dispatch` via the GitHub API.
- **"Changed" is defined by git.** `_curator/state.json` holds `{ "lastProcessedSha": "..." }`. Each run does `git diff --name-status <last-sha>..HEAD` for `pages/*.json`, then advances the SHA only after a successful run.
- **The initial migration is excluded.** Seed `_curator/state.json` with the current data-repo HEAD so the first nightly run sees zero backlog. Do not ask the curator to process ~3,700 notes on day one.

## 3. Pipeline, per run (v1)

Pages are JSON (`pages/{id}.json`), not Markdown frontmatter. `connected` is an array of page ids on the page record.

For each page changed since the last processed SHA (cap 50, oldest first if over cap):

1. **Refresh its embedding** against the in-memory corpus (R2 research vectors when the workflow has them; `migrated/index.json` locally). Trivial edits still re-embed — not worth classifying meaningful vs trivial.
2. **Retrieve candidates.** Brute-force cosine similarity vs the corpus. Take the top 15.
3. **Drop dead weight:** the note itself, anything already in `connected`, anything already pending or dismissed, and anything below the relevance floor (`0.35`).
4. **Split remaining candidates:**
   - **Very high similarity (≥ 0.92):** hold back from linking. Do **not** enqueue a duplicate-merge item in v1.
   - **Everything else:** linking path.
5. **One Claude call per changed note**, structured JSON: for each remaining candidate, whether it is genuinely related, a short rationale, and a relation label (`related` | `builds-on` | `contrasts-with`).
6. **Write proposals, not links.** Append to `_curator/pending-proposals.json`. Dedupe by unordered pair. Include titles and one-line excerpts so the queue is scannable from one file.
7. **Update `_curator/state.json`** only after the proposal file is written. Failed run → SHA does not move → retry the same range.

## 4. Review queue (v1 UI)

A Knowledge Hub rail (**Wiki**), not a chat.

- Reads `_curator/pending-proposals.json` through a session-authenticated Netlify function (same GitHub Contents pattern as page save).
- Each item: two titles, one-line excerpt each, relation label, Claude rationale.
- **Approve** → write the id into both pages' `connected` (bidirectional) and drop the item from pending.
- **Dismiss** → drop from pending; record in `_curator/dismissed.json` so the pair is not re-proposed.
- **Approve all / Dismiss all** for the current pending list.
- **Run now** → `workflow_dispatch` on `.github/workflows/curator.yml`.

Local Vite preview without Netlify cannot write the data repo; same constraint as authoring.

## 5. Duplicate detection — later, not v1

Embedding similarity is a filter for "worth checking," not evidence for "these are the same idea."

Later: a dedicated Claude call on both full bodies; confirmed duplicates go to a separate queue; merge is manual (canonical + dated append of unique content; other file moved to `_archive/`, never deleted).

v1 only withholds ≥ 0.92 pairs from the linking queue.

## 6. Data artifacts (data repo)

- `_curator/state.json` — `{ "lastProcessedSha": "..." }`
- `_curator/pending-proposals.json` — array of `{ id, noteA, noteB, titleA, titleB, excerptA, excerptB, relation, rationale, proposedAt }`
- `_curator/dismissed.json` — array of `{ noteA, noteB, dismissedAt }`
- Page `connected: string[]` changes only on explicit approve. Looking at a note does not mutate it.

## 7. Cost

- Embedding refresh: same OpenAI embeddings key as `build-index`.
- Candidate retrieval: in-memory cosine.
- Reasoning: one Claude call per changed note (body + ~15 excerpts). Cap 50 notes/run.
- Guardrail: if more than 50 pages changed, process 50 and leave the rest for the next run.

## 8. Edge cases (v1)

- **A page is deleted.** Diff deletions. From the data-repo checkout, strip that id from other pages' `connected`, drop pending/dismissed rows that mention it.
- **Two notes in the same run would propose each other.** One undirected proposal.
- **Run fails midway.** State SHA does not advance.
- **Corpus growth.** Brute-force cosine is fine at thousands of notes.

## 9. Testing

- Unit tests (Vitest): git-diff parsing; candidate filtering; pair dedupe; state advancement; approve/dismiss; deleted-id strip.
- Integration with mocked Claude: fixture note + candidates → pending shape; second run on unchanged SHA → no new proposals.
- Review queue: client + function tests (session required). No Playwright required for the Action itself.

## 10. Judgment calls

- Nightly + on-demand, not continuous.
- Duplicate merge deferred.
- Candidate cap 15, run cap 50, link floor 0.35, duplicate hold-back 0.92 — tunable once real proposal quality is visible.
