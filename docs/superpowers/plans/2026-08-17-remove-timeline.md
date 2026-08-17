# Remove Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Timeline feature, its navigation, runtime code, styling, tests, and obsolete feature documents.

**Architecture:** Timeline is isolated to two modules plus integration code in `main.ts` and a contiguous CSS section. Remove those surfaces without replacing them; archive search, page opening, area filters, Graph, and the remaining rail destinations continue unchanged.

**Tech Stack:** TypeScript, CSS, Vitest, Vite

---

### Task 1: Remove Timeline from the application shell

**Files:**
- Modify: `src/main.ts`

- [ ] Remove Timeline module imports.
- [ ] Remove `"timeline"` from `View`.
- [ ] Remove Timeline query, area, busy, error, teardown, and generation state.
- [ ] Remove the Timeline icon, rail button, and special-navigation mapping.
- [ ] Remove Timeline teardown from `shell()`.
- [ ] Delete `renderTimeline()` and `paintTimeline()`.
- [ ] Remove Timeline dispatch from `render()`.
- [ ] Run `rg "timeline|Timeline" src/main.ts` and expect no matches.

### Task 2: Remove Timeline implementation and styling

**Files:**
- Delete: `src/timeline/build.ts`
- Delete: `src/timeline/build.test.ts`
- Delete: `src/timeline/mount.ts`
- Delete: `src/timeline/mount.test.ts`
- Modify: `src/style.css`

- [ ] Delete the complete `.timeline-stage` through reduced-motion Timeline CSS block.
- [ ] Delete the four Timeline module and test files.
- [ ] Run `rg "timeline__|timeline-stage|timeline-in|timeline-axis" src` and expect no matches.

### Task 3: Remove obsolete Timeline documents

**Files:**
- Delete: `docs/superpowers/specs/2026-08-15-keyword-timeline-design.md`
- Delete: `docs/superpowers/plans/2026-08-15-keyword-timeline.md`

- [ ] Delete the original feature spec and implementation plan.
- [ ] Keep `docs/superpowers/specs/2026-08-17-remove-timeline-design.md` and this removal plan as the record of the decision.

### Task 4: Verify removal

**Files:**
- Verify: all remaining source and test files

- [ ] Run `npm run test:unit`.
- [ ] Confirm all remaining tests pass and only the two deleted Timeline test files reduce the test-file count.
- [ ] Run `npm run build`.
- [ ] Confirm Vite exits successfully.
- [ ] Run `git diff --check`.
- [ ] Review `git status --short` and confirm only the intended Timeline removal and removal documents are outstanding.
