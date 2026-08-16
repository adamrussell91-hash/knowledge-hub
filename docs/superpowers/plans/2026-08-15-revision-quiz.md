# Revision Quiz (Retrieval Sprint) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a token-free Retrieval Sprint on the Knowledge Hub rail: harvest testable items from page markdown, FSRS-schedule them, self-grade, persist status to the data repo (or localStorage in Vite preview).

**Architecture:** Pure harvest + status + queue in `src/quiz/`. Browser runs FSRS. Netlify only GET/PUT JSON in `knowledge-hub-data` (`quiz/schedule.json`, `quiz/items/{pageId}.json`). No model calls.

**Tech Stack:** TypeScript, Vitest, `ts-fsrs`, existing Netlify session + GitHub Contents write helpers, Vite SPA.

---

### Task 1: Harvest

**Files:**
- Create: `src/quiz/harvest.ts`
- Test: `src/quiz/harvest.test.ts`

- [ ] Failing tests for Q/A, definitions, headings, cap, short skip, References skip
- [ ] Implement `harvestPage`
- [ ] `npx vitest run src/quiz/harvest.test.ts`

### Task 2: Status + queue

**Files:**
- Create: `src/quiz/status.ts`, `src/quiz/queue.ts`, `src/quiz/schema.ts`
- Test: `src/quiz/status.test.ts`, `src/quiz/queue.test.ts`

- [ ] Status derivation table
- [ ] Due-first queue, tag/area filter, cram, duration caps

### Task 3: FSRS wrap + store merge

**Files:**
- Create: `src/quiz/review.ts`, `src/quiz/store.ts`
- Test: `src/quiz/review.test.ts`, `src/quiz/store.test.ts`
- Modify: `package.json` (`ts-fsrs`)

- [ ] `applyRating` updates FSRS + status
- [ ] `mergeItemFile` / `mergeSchedule` by id

### Task 4: Netlify quiz API

**Files:**
- Create: `netlify/functions/quiz-get.ts`, `quiz-items.ts`, `quiz-save.ts` + tests + handlers
- Modify: `netlify.toml`

- [ ] 401 without session; empty 404 → empty schedule; save merge

### Task 5: Client + Quiz rail UI

**Files:**
- Modify: `src/api/client.ts`, `src/main.ts`, `src/style.css`
- Test: `src/api/client.test.ts`

- [ ] localStorage when `USE_LOCAL_DATA`; live `/api/quiz*`
- [ ] Rail Quiz, sprint form, reveal, four ratings, save on end
