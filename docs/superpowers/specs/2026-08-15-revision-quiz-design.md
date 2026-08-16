# Revision quiz (Retrieval Sprint) — Design Spec

**Date:** 2026-08-15  
**Status:** Approved design (slice A)  
**Depends on:** Knowledge Hub pages (`src/domain/page.ts`), hub authoring save pipes, Research rail scope (`area` + `tags`)  
**Product home:** Knowledge Hub rail. Later slices (HQE AI grade, Dump and Sort, understanding graph view) are separate specs.

This spec supersedes the Research-rail non-goal “revision quiz”. It is slice A of the Life Hub retrieval-engine vision: **notes become a verified-understanding graph**. Only the atoms and the first closed loop ship here.

Grounding (read, not copied into the product):

- Study Methods: Brain Dump then Sort, Highlight-Question-Explain, Spaced Repetition
- Notes: 4 Methods of Retrieval Practice, Making Retrieval Practice Actually Work, Spaced retrieval practice

Ignore Obsidian/Coda. Source of truth for content is `knowledge-hub-data` page JSON. Notion is not called at runtime.

## Goal

Adam starts a **Retrieval Sprint**: cued recall from his own Hub pages, scheduled with FSRS, self-graded. Each rating writes **status** onto a discrete item (not the whole page). Untested stays grey-ready; verified / decaying / failed are derived from review history.

The session is a **learning event**, not a test (Hendrick / Karpicke). Low stakes. Cover the source, retrieve, then see the answer from the note. One successful recall does not retire an item.

## Token budget (hard)

This slice makes **zero** Anthropic, OpenAI, Voyage, or Workers AI calls.

- Harvest is deterministic markdown parse.
- Grading is Again / Hard / Good / Easy (FSRS), not model comparison.
- Scheduling is `ts-fsrs` in the browser.
- No “generate quiz from 3700 notes” job.

Later HQE AI grading is out of this spec precisely because it would spend tokens on every card.

## Non-goals

- HQE AI explanation grading
- Dump and Sort / sort-then-dump canvas
- Interleaved exam sim, Why/How drill, quote cloze
- Understanding-graph **view** (status fields exist so that view can read them later)
- Deadline weighting (pages have no deadline field)
- Extracting the full corpus up front
- D1 / Durable Objects as item store
- Browser-held GitHub secrets
- Changing passphrase auth
- SM-2 as the scheduler

## Approaches considered

1. **Deterministic harvest + FSRS + self-grade (chosen).** Matches token budget. Uses Q/A already in notes when present; otherwise definitions and heading claims. Persist to the data repo like pages.
2. **On-demand Haiku extract per topic.** Better items, real cost every new tag set, and a second “is this a good card?” failure mode. Deferred.
3. **Live conversational quiz via Clementine.** Original one-line Hub feature. Expensive, unscheduled, no durable node status. Rejected.

## Architecture

```
Browser (signed in)
  GET  existing /api/pages + /api/pages/:id     (bodies for harvest)
  GET  /api/quiz                                (schedule + items already stored)
  POST /api/quiz-save                           (schedule + new/updated items)
        │
        ▼
Netlify (session cookie, same as pages-save)
  GitHub Contents API → knowledge-hub-data
    quiz/schedule.json
    quiz/items/{pageId}.json
```

Local Vite (`VITE_USE_LOCAL_DATA`): same item/schedule schema in `localStorage` key `knowledge-hub-quiz`. No GitHub write. Harvest from local page JSON.

FSRS and harvest never run on Netlify. The function only reads/writes JSON.

### Why two GitHub files, not one

GitHub Contents API is a poor fit for a multi-megabyte blob. `quiz/schedule.json` is compact (due dates, FSRS numbers, status, cue preview). Full cue/answer live in `quiz/items/{pageId}.json` so a sprint loads only the pages it needs. SHA read-modify-write per file, same retry pattern as `pages-save`.

### Why not harvest in a Worker

A Worker pass over thousands of pages would either cost model tokens or duplicate GitHub reads the browser already does for scoped sprints. Scope is small (tags / area). Fetch those page bodies with the existing authenticated page API.

## Item model

```ts
type QuizItemKind = "qa" | "definition" | "heading";

type QuizItemStatus = "untested" | "verified" | "decaying" | "failed";

type QuizRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy — FSRS-4.5

type FsrsCard = {
  due: string; // ISO
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
  last_review?: string;
};

type QuizItem = {
  id: string; // item_{fnv1a64(pageId + "\\n" + kind + "\\n" + cue)} — 16 hex chars, sync, stable
  page_id: string;
  area: "university" | "notes";
  tags: string[];
  kind: QuizItemKind;
  cue: string;
  answer: string;
  harvested_at: string;
  source_updated_at: string; // page.updated_at at harvest
  fsrs: FsrsCard;
  status: QuizItemStatus;
};

type QuizScheduleEntry = {
  id: string;
  page_id: string;
  area: "university" | "notes";
  tags: string[];
  kind: QuizItemKind;
  cue_preview: string; // first 80 chars
  due: string;
  status: QuizItemStatus;
  reps: number;
  lapses: number;
};

type QuizStore = {
  schema_version: 1;
  schedule: QuizScheduleEntry[];
};
```

New cards: FSRS state `New`, `due` = now, `status` = `untested`.

**Status derivation** (pure function, no model):

- `reps === 0` → `untested`
- last rating was Again, or `lapses > 0` and state is Relearning → `failed`
- `reps >= 2` and next interval (`scheduled_days`) ≥ 21 → `verified`
- otherwise if `reps >= 1` and due in the past → `decaying`
- otherwise if `reps >= 1` → `verified` if `scheduled_days` ≥ 7, else `untested` (still in learning)

Ace-once does not equal verified (4 Methods + Spaced Repetition: one-and-done is a failure mode).

## Harvest

`harvestPage(page: Page): QuizItem[]` is pure. Cap **12 items per page**. Skip if `page.body.trim().length < 80`.

Priority order (stop when cap hit):

1. **Existing Q/A** (HQE already in the note — do not regenerate). Blocks matching, case-insensitive:
   - `Q:` / `Question:` line, then later `A:` / `Answer:` / `Explain:` line, until next Q or a heading.
   - Markdown `**Q:**` / `**A:**` variants.
2. **Definitions.** A line or paragraph starting with `**Term**` followed by `:` or ` is ` or ` — `; cue = Term; answer = rest (strip markdown bold).
3. **Heading claims.** `##` / `###` (not `#` title) plus the following paragraph (until blank line or next heading). Cue = `What does this note claim about: {heading}?`; answer = that paragraph. Skip headings that are only “References”, “Further reading”, “See also”.

Dedup by item `id`. Re-harvest a page when `page.updated_at > item.source_updated_at`: replace items whose cue hash disappeared; keep FSRS state for ids that still match.

Harvest runs **on sprint start** for pages in scope that are missing from the store or stale, **up to 15 page fetches** per start (avoid pulling the whole archive). Prefer pages with more tags overlapping the filter, then recency (`updated_at`). If the due queue already has enough cards for the session, skip extra harvest.

## Scheduler

Library: `ts-fsrs`, FSRS-4.5 defaults. Rating buttons map 1–4.

Queue for a sprint:

1. Filter schedule by optional `area` and `tags` (exact tag match, same as Research scope).
2. Take items with `due <= now`, oldest due first.
3. If fewer than the session target, append `untested` items in scope (new harvest included).
4. Session target from duration: 5 min → 8 cards, 15 min → 20, 30 min → 36. Stop when time elapsed **or** queue empty, whichever first. A visible timer; no auto-advance.

Manual cram: checkbox **Ignore due dates** uses the same scope, shuffles, still writes FSRS (cram ratings count; user asked for a toggle in the long spec — include this one control, not deadline weighting).

## UI

Rail: **Archive · Uni · Notes · Graph · Research · Quiz**. Warm Cotton tokens, same chrome as Research. Not the Brain Dump widget’s Playfair/ink palette (that shell is for Dump and Sort later).

Quiz home (not a chat):

- Duration: 5 / 15 / 30 minutes
- Area: All / University / Notes
- Tags: multi-select from loaded manifest
- Ignore due dates
- **Start sprint**

Sprint card:

- Cue only at first
- **Reveal** shows `answer` and a link to open the archive page (reader)
- Then Again / Hard / Good / Easy
- Counter `n / remaining` and remaining time
- **End sprint** saves immediately

End summary: counts per rating; counts per status after write-back. No streaks, no confetti.

Empty: “Nothing due in this scope. Harvest found no testable units — add Q:/A: pairs to notes, or widen tags.”

Local preview: works via localStorage; no Netlify banner unless the user is on the live API path without local data.

## Persistence API

### `GET /api/quiz`

Session required. Returns `{ schedule, itemsByPage: Record<string, QuizItem[]> }` where `itemsByPage` is **not** the whole bank: omit bodies on GET of schedule-only.

Split:

- `GET /api/quiz` → `{ schema_version: 1, schedule: QuizScheduleEntry[] }` from `quiz/schedule.json` (404 → empty schedule).
- `GET /api/quiz/items/:pageId` → `{ items: QuizItem[] }` from `quiz/items/{pageId}.json` (404 → `[]`).

### `POST /api/quiz-save`

Session required. Body:

```json
{
  "schedule": [ /* full schedule array */ ],
  "items": [ /* QuizItem[] changed this session */ ]
}
```

Server writes `quiz/schedule.json` (full replace with SHA retry, max 3). Groups `items` by `page_id` and read-modify-writes each `quiz/items/{pageId}.json` (merge by item id). Empty create is allowed.

Max body: 1.5MB JSON. 401 without session. GitHub token write failure → 503.

Client: load schedule at Quiz view mount; load item files for pages in the session queue; save once at End sprint (and if the tab is hidden via `visibilitychange` after at least one rating).

## Error handling

- Unauthenticated: same login gate.
- Missing `quiz/schedule.json`: empty store, not an error.
- Harvest fetch failure for one page: skip that page, continue.
- Save failure: keep ratings in memory, show “Could not save quiz progress.” Retry button.
- Corrupt JSON: 502 with a clear error; do not clobber the GitHub file.

## Testing

No live GitHub or model APIs.

- `harvestPage`: Q/A pairs, definitions, headings, cap 12, skip short bodies, skip References.
- Item id stable across re-harvest when cue+kind+pageId unchanged.
- Status derivation table (untested / verified / decaying / failed).
- Queue: due-first, then untested; tag/area filter; cram ignores due.
- Session length maps to card caps; timer stop.
- Netlify GET empty vs present; POST merge by id; no session → 401.
- Client: localStorage path in `USE_LOCAL_DATA`; live path uses `/api/quiz*`.

## Later slices (not this spec)

Dump and Sort seeds untested nodes from blue gaps. HQE mode grades explanations. Graph view paints black / blue / orange from `status`. Those read this store; they must not require a second item model.
