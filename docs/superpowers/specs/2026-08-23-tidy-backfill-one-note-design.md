# Tidy Backfill and One-Note Scheduling Design

## Purpose

Drain the archive's real tidy backlog without sending already-clean, canonically tagged notes to Claude, then make the daily tidy workflow process one note while temporarily bypassing failed pages so the queue continues to advance.

## Scope and constraints

- Code changes live only in `knowledge-hub`; data changes live only in `knowledge-hub-data`.
- Reuse `runTidy`, `proposeTidy`, `shouldSkipTidy`, and the existing local JSON I/O. Do not create a second tidy implementation.
- Keep the closed topic vocabulary and the existing three-tag target unchanged.
- Preserve direct `--id` tidying for the reader and manual retries.
- Do not introduce UI, a production local-file fallback, or a new archive schema.
- Process model work in batches of five and commit and push the data repository after each batch with at least one success.
- Run a 100-model-call pilot and require explicit cost approval before continuing the full model-backed drain.

## Eligibility and clean-note fast path

The runner snapshots all page IDs and reads the current tidy state at startup. A page is already complete when `shouldSkipTidy(page, lastTidiedAt)` returns true.

Every remaining page is classified before a model call:

- A page is stamped as tidied without calling Claude when it is not `isMessy(page)`, has between one and three topic tags, and every topic tag resolves through the closed vocabulary.
- A page goes to Claude when it is messy, has no topic tags, or has any unknown/non-vocabulary topic tag.
- Non-topic metadata tags remain untouched and do not make a clean page model-eligible.

Fast-path stamps are persisted in `_tidy/state.json` during one preflight pass and committed once before model work begins. They do not rewrite the page or manifest. Batches of five apply to Claude-eligible pages, avoiding hundreds of tiny commits for state-only stamps.

## Shared local tidy I/O

Extract the filesystem-backed `TidyIO` construction from `scripts/run-tidy.ts` into a focused script module. Both the existing CLI and the backfill runner use that factory, so page, manifest, state, prompt, and proposal behavior remain identical.

The proposal wrapper accepts an optional usage callback. It reports Anthropic's `usage.input_tokens` and `usage.output_tokens` without changing the existing `TidyProposal | null` return contract.

## Failure state and scheduled selection

Extend `TidyState` compatibly with an optional per-page failure map:

```ts
type TidyFailure = {
  attempts: number;
  lastFailedAt: string;
  reason: string;
};

type TidyState = {
  lastRunAt?: string;
  tidied: Record<string, string>;
  failures?: Record<string, TidyFailure>;
};
```

Malformed legacy values are discarded by `normalizeTidyState`. A scan excludes a page whose latest failure is less than 72 hours old. An explicit `--id` bypasses this exclusion. A failure increments its attempt count and records its timestamp and reason without marking the page tidied; a success stamps `tidied[id]` and removes `failures[id]`.

The scan default and hard cap are both one. `.github/workflows/tidy.yml` invokes `--scan --count 1`. A failed scheduled note may still fail that workflow run, but the persisted failure record makes the following daily runs choose another eligible note.

## Backfill execution

The backfill runner:

1. Requires a clean `knowledge-hub-data` worktree and snapshots eligible page IDs.
2. Applies and pushes the clean-note fast path in one preflight commit, then processes Claude-eligible IDs explicitly through `runTidy({ id })` in ordered batches of five.
3. Continues after per-page read, model, validation, or write failures.
4. Retries Anthropic 400 and 429 failures with bounded exponential delays; no other failure tight-loops.
5. Commits and pushes pages, `manifest.json`, and `_tidy` after every batch containing a success, using `Tidy archive notes (backfill batch N).`
6. After the main pass, retries each of the two named stuck IDs once if it failed during the pass.
7. Writes `_tidy/backfill-skip-list.json` as records containing `id` and `reason`, then commits and pushes the final state if it changed.

The command supports a model-call limit. The first live run uses a limit of 100; fast-path stamps do not consume that limit. The runner stops cleanly after the batch containing the hundredth model call and reports remaining Claude-eligible pages and accumulated token usage.

## Cost pilot and approval gate

For every Anthropic response, including responses whose proposal later fails validation, accumulate actual input and output tokens returned by the API. At standard global Claude Haiku 4.5 pricing, cost is calculated as:

```text
pilot_cost_usd = input_tokens / 1,000,000 * 1.00
               + output_tokens / 1,000,000 * 5.00
```

After 100 model-called pages, report:

- successful, unchanged, failed, and fast-path-stamped counts;
- actual input tokens, output tokens, and pilot USD cost;
- the number of model-eligible pages remaining after reclassification;
- projected remaining and total cost using separate observed mean input and output tokens per attempted page;
- a range using the pilot's per-page 10th and 90th percentile costs, so outliers are visible.

The full run must not resume until the user explicitly approves that estimate. Pricing is based on Anthropic's published standard Claude Haiku 4.5 rates of $1 per million input tokens and $5 per million output tokens.

## Verification

Use test-driven development for:

- the one-note scan cap and default;
- 72-hour failure exclusion;
- explicit-ID retry despite cooldown;
- success clearing a prior failure;
- clean canonical pages taking the no-model fast path;
- backoff on 400 and 429;
- continuation after a failed backfill page;
- the 100-call stop and token-cost summary.

Run focused tests during each red/green cycle, then run the complete `npm test` suite. Open a pull request from `codex/tidy-backfill-one-note` after verification. Data commits are made only in `knowledge-hub-data`.
