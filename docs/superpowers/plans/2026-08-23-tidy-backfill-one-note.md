# Tidy Backfill and One-Note Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clean-note-aware archive backfill with measured pilot costs, and make scheduled tidy runs advance one note at a time past recent failures.

**Architecture:** Extend the existing tidy controller with compatible failure metadata and one-note scan selection. Extract the current filesystem adapter for reuse by the normal CLI and a focused backfill orchestrator that pre-stamps clean canonical notes, invokes `runTidy({ id })` for model work, records usage, and commits data in five-page model batches.

**Tech Stack:** TypeScript, Node.js 22, Vitest, Anthropic Messages API, Git/GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-tidy-backfill-one-note-design.md`

## Global Constraints

- Code changes live only in `knowledge-hub`; data changes live only in `knowledge-hub-data`.
- Reuse `runTidy`, `proposeTidy`, `shouldSkipTidy`, and shared local JSON I/O; do not create a parallel tidy implementation.
- Keep `claude-haiku-4-5`, the closed topic vocabulary, and the existing three-tag target unchanged.
- Scheduled scans process at most one note; direct `--id` remains available and bypasses failure cooldown.
- Backfill model work uses batches of five and stops after 100 model-called pages for cost approval.
- No UI, local-file production fallback, Documents/Desktop path, or archive schema rewrite.

---

### Task 1: Persist failures and cap scans at one

**Files:**
- Modify: `src/tidy/run.ts`
- Test: `src/tidy/run.test.ts`

**Interfaces:**
- Produces: `TidyFailure`, compatible `TidyState.failures`, and scan selection with a 72-hour cooldown.
- Preserves: `runTidy(io): Promise<{ selected; changed; skipped; errors }>` and explicit-ID semantics.

- [ ] **Step 1: Write failing controller tests**

Add focused tests proving: `count: 100` calls the proposer once; a failure is saved with `attempts`, `lastFailedAt`, and `reason`; a second scan within 72 hours skips it and selects the next page; explicit `id` still calls it; and a later success removes its failure record.

```ts
expect(called).toHaveLength(1);
expect(state).toMatchObject({ failures: { bad: { attempts: 1, lastFailedAt: NOW, reason: "model failed" } } });
expect(nextScan.selected).toEqual(["good"]);
expect(explicit.selected).toEqual(["bad"]);
expect(successState.failures).not.toHaveProperty("bad");
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/tidy/run.test.ts`

Expected: the old twenty-page cap and missing failure metadata make the new assertions fail.

- [ ] **Step 3: Implement the minimal state and selection change**

Add `TidyFailure`, normalize valid failure records, exclude failures where `now - lastFailedAt < 72 hours` only during scan selection, cap the selected slice at one, record failures in the catch block, and clear a failure after successful proposal/application.

```ts
const FAILURE_COOLDOWN_MS = 72 * 60 * 60 * 1000;
const recentlyFailed = (state: TidyState, id: string, now: string) => {
  const failedAt = Date.parse(state.failures?.[id]?.lastFailedAt ?? "");
  return Number.isFinite(failedAt) && Date.parse(now) - failedAt < FAILURE_COOLDOWN_MS;
};
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/tidy/run.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tidy/run.ts src/tidy/run.test.ts
git commit -m "fix: advance tidy scans past recent failures"
```

### Task 2: Capture usage and retry Anthropic 400/429 responses

**Files:**
- Modify: `src/tidy/propose.ts`
- Test: `src/tidy/propose.test.ts`

**Interfaces:**
- Produces: `TidyUsage = { inputTokens: number; outputTokens: number }`.
- Extends: `proposeTidy(input)` with optional `onUsage`, `sleep`, and `maxRetries` inputs while preserving `Promise<TidyProposal | null>`.

- [ ] **Step 1: Write failing proposal tests**

Add one test where 429 then 400 then 200 succeeds, asserting delays of 1,000 and 2,000 milliseconds and three fetches. Add one test asserting the callback receives `{ inputTokens: 120, outputTokens: 35 }` from a successful response.

```ts
expect(sleep.mock.calls).toEqual([[1000], [2000]]);
expect(onUsage).toHaveBeenCalledWith({ inputTokens: 120, outputTokens: 35 });
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/tidy/propose.test.ts`

Expected: `proposeTidy` currently makes one request and discards `usage`.

- [ ] **Step 3: Implement bounded exponential backoff and usage reporting**

Loop for at most `maxRetries ?? 2` retries. Retry only status 400 or 429, use injected `sleep ?? setTimeout`, and calculate `1000 * 2 ** attempt`. Parse API usage defensively and invoke `onUsage` only for finite non-negative token counts.

```ts
type TidyUsage = { inputTokens: number; outputTokens: number };
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/tidy/propose.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tidy/propose.ts src/tidy/propose.test.ts
git commit -m "feat: measure and back off tidy proposals"
```

### Task 3: Share local filesystem I/O and default the CLI to one

**Files:**
- Create: `scripts/tidy-local-io.ts`
- Modify: `scripts/run-tidy.ts`
- Test: `scripts/run-tidy.test.ts`

**Interfaces:**
- Produces: `createLocalTidyIO({ dataDir, apiKey, prompt, now?, onUsage? }): Omit<TidyIO, "id" | "scan" | "count">`.
- Produces: `parseTidyArgs()` returning `count: 1` for scan mode without an explicit count.

- [ ] **Step 1: Write the failing CLI default test**

```ts
expect(parseTidyArgs(["--scan", "--data-dir", "data-repo"]))
  .toEqual({ scan: true, count: 1, dataDir: "data-repo" });
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- scripts/run-tidy.test.ts`

- [ ] **Step 3: Extract the existing adapter and set the scan default**

Move the current page, manifest, state, and prompt-backed proposal callbacks without changing their JSON behavior. Have `run-tidy.ts` load arguments/environment, create the adapter, call `runTidy`, print the result, and preserve `assertNoTidyErrors`.

- [ ] **Step 4: Run CLI and controller tests and verify GREEN**

Run: `npm test -- scripts/run-tidy.test.ts src/tidy/run.test.ts`

- [ ] **Step 5: Commit**

```bash
git add scripts/tidy-local-io.ts scripts/run-tidy.ts scripts/run-tidy.test.ts
git commit -m "refactor: share local tidy filesystem IO"
```

### Task 4: Build and test the backfill orchestrator

**Files:**
- Create: `scripts/tidy-backfill.ts`
- Create: `scripts/tidy-backfill.test.ts`

**Interfaces:**
- Produces: `needsModelTidy(page: Page): boolean`.
- Produces: `runTidyBackfill(options: BackfillOptions): Promise<BackfillSummary>` with injected page/state I/O and batch persistence for unit tests.
- `BackfillSummary` includes scanned, stamped, attempted, succeeded, unchanged, failed, remainingModelEligible, inputTokens, outputTokens, pilotCostUsd, and per-page cost samples.

- [ ] **Step 1: Write failing classification and continuation tests**

Prove a clean page with one to three canonical topics is stamped without calling `runTidy`; messy, untagged, and unknown-topic pages require the model; and a rejected page does not prevent the following page from succeeding.

```ts
expect(needsModelTidy(cleanCanonical)).toBe(false);
expect(needsModelTidy(messy)).toBe(true);
expect(needsModelTidy(untagged)).toBe(true);
expect(needsModelTidy(unknownTopic)).toBe(true);
expect(summary).toMatchObject({ attempted: 2, succeeded: 1, failed: 1 });
```

- [ ] **Step 2: Write the failing pilot-limit and cost tests**

Create 105 model-eligible pages, verify only 100 page IDs are attempted, and assert cost at $1/M input plus $5/M output. Verify fast-path stamps do not consume the 100-page limit.

```ts
expect(attemptedIds).toHaveLength(100);
expect(summary.pilotCostUsd).toBe((inputTokens + outputTokens * 5) / 1_000_000);
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `npm test -- scripts/tidy-backfill.test.ts`

Expected: the module does not exist.

- [ ] **Step 4: Implement the minimal orchestrator**

Use `isMessy`, `isTopicKeyword`, and `canonicalTopicTag` for classification. Snapshot the candidate list, stamp all clean pages in one state write, process model IDs sequentially in slices of five through the injected explicit-ID runner, aggregate errors without throwing, and retain failed reasons for the skip list.

- [ ] **Step 5: Add the two known-ID retry test and implementation**

Verify only failed IDs in the fixed known-ID set receive one post-pass retry and remain in leftovers only if that retry also fails.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- scripts/tidy-backfill.test.ts src/tidy/run.test.ts src/tidy/propose.test.ts`

- [ ] **Step 7: Commit**

```bash
git add scripts/tidy-backfill.ts scripts/tidy-backfill.test.ts
git commit -m "feat: add resumable tidy archive backfill"
```

### Task 5: Add the executable data-repository workflow

**Files:**
- Create: `scripts/run-tidy-backfill.ts`
- Modify: `package.json`
- Modify: `.github/workflows/tidy.yml`
- Test: `scripts/run-tidy-backfill.test.ts`

**Interfaces:**
- Produces command: `npm run tidy:backfill -- --data-dir /Users/adamrussell/Projects/knowledge-hub-data --model-limit 100 --batch-size 5`.
- Uses: `scripts/push-data-repo.sh` after non-empty commits.

- [ ] **Step 1: Write failing argument and git-boundary tests**

Test default batch size five, positive `--model-limit`, required `--data-dir`, clean-worktree rejection, batch commit message numbering, and skip-list JSON records shaped as `{ id, reason }`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- scripts/run-tidy-backfill.test.ts`

- [ ] **Step 3: Implement the executable wrapper**

Load `.env`, require `ANTHROPIC_API_KEY`, resolve the explicit data directory, assert it is a Git worktree with no initial changes, create the shared adapter, execute the preflight and model batches, and invoke Git using argument arrays rather than interpolated shell strings. Write and push the final skip list and print machine-readable JSON summary.

- [ ] **Step 4: Set the package command and one-note workflow flag**

Add `"tidy:backfill": "tsx scripts/run-tidy-backfill.ts"` and change the scheduled workflow command from `--count 20` to `--count 1`. Leave the `--id` branch intact.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- scripts/run-tidy-backfill.test.ts scripts/run-tidy.test.ts src/tidy/run.test.ts`

- [ ] **Step 6: Commit**

```bash
git add scripts/run-tidy-backfill.ts scripts/run-tidy-backfill.test.ts package.json .github/workflows/tidy.yml
git commit -m "feat: wire tidy backfill and one-note schedule"
```

### Task 6: Verify, publish the code PR, and run the 100-page pilot

**Files:**
- Modify during execution only: `/Users/adamrussell/Projects/knowledge-hub-data/pages/*.json`
- Modify during execution only: `/Users/adamrussell/Projects/knowledge-hub-data/manifest.json`
- Modify during execution only: `/Users/adamrussell/Projects/knowledge-hub-data/_tidy/state.json`
- Create during execution only: `/Users/adamrussell/Projects/knowledge-hub-data/_tidy/backfill-skip-list.json`

**Interfaces:**
- Produces: GitHub pull request for the code branch and a pushed 100-page pilot in the data repository.

- [ ] **Step 1: Run complete verification**

Run: `npm test`

Expected: all Vitest suites pass with no unhandled errors.

- [ ] **Step 2: Confirm branch scope**

Run: `git status --short && git diff --check origin/main...HEAD && git log --oneline origin/main..HEAD`

- [ ] **Step 3: Push and open the pull request**

Push `codex/tidy-backfill-one-note`, open a PR summarizing failure cooldown, one-note scheduling, fast-path stamping, and pilot cost accounting, and include the complete test result.

- [ ] **Step 4: Fast-forward and validate the data checkout**

Fast-forward `/Users/adamrussell/Projects/knowledge-hub-data` to `origin/main`, confirm it is clean, and verify `ANTHROPIC_API_KEY` is available without printing it.

- [ ] **Step 5: Run exactly the 100-page pilot**

Run:

```bash
npm run tidy:backfill -- --data-dir /Users/adamrussell/Projects/knowledge-hub-data --model-limit 100 --batch-size 5
```

Expected: clean notes are stamped in the preflight, at most 100 Claude-eligible page IDs are attempted, every successful five-page batch is committed and pushed, and the process exits cleanly with a JSON cost summary.

- [ ] **Step 6: Audit the pushed data and calculate the estimate**

Confirm the data worktree is clean and matches `origin/main`. Calculate actual pilot cost and projected total/remaining cost from captured input/output tokens, plus the per-page p10–p90 range.

- [ ] **Step 7: Stop for approval**

Report the pilot results and cost projection directly in chat. Do not resume the remaining backfill until the user explicitly approves the projected cost.
