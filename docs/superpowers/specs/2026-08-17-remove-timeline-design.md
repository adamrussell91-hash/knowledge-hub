# Remove Timeline Feature

## Goal

Remove the Timeline feature completely so the Knowledge Hub no longer exposes or maintains an unused chronological archive view.

## Removal Scope

Delete the Timeline navigation button and icon, the `"timeline"` view variant, Timeline-specific state, teardown logic, rendering, search, filtering, and mounting code from `src/main.ts`.

Delete the Timeline presentation rules from `src/style.css`.

Delete the complete `src/timeline/` module and its unit tests:

- `src/timeline/build.ts`
- `src/timeline/build.test.ts`
- `src/timeline/mount.ts`
- `src/timeline/mount.test.ts`

Delete the original Timeline design and implementation documents:

- `docs/superpowers/specs/2026-08-15-keyword-timeline-design.md`
- `docs/superpowers/plans/2026-08-15-keyword-timeline.md`

## Preserved Behavior

Archive list search, Graph search, page opening, area filters, and all other rail destinations remain unchanged.

Generic prose containing the word “timeline” remains where it does not refer to the removed product feature. Historical references in unrelated feature specs remain unless they incorrectly claim the Timeline still exists.

## Verification

Search the active source and styles for Timeline feature identifiers and confirm none remain. Run the complete unit suite and production build. The expected test count decreases only by the deleted Timeline test files.
