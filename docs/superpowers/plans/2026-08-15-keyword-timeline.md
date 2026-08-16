# Keyword Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Timeline rail that searches the archive, lays matching notes on a chronological axis, and opens a note when a node is clicked.

**Architecture:** Reuse `searchPages` / `rankByQuery`. Put optional `created_at` on the manifest so the client never fetches bodies. Pure `buildTimeline` maps hits to positions and lanes. `mountKeywordTimeline` is DOM + CSS (no canvas, no d3). `main.ts` adds `view === "timeline"` next to Graph.

**Tech Stack:** TypeScript, Vitest (jsdom for mount), Zod, existing Vite rail in `src/main.ts`, Warm Cotton CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-15-keyword-timeline-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/domain/page.ts` | Optional `created_at` on `PageManifestEntry` |
| `netlify/functions/_lib/dataRepo.ts` | `toManifestEntry` copies `created_at` |
| `src/api/localData.ts` | Pass `created_at` through local manifest |
| `scripts/migrate-notion.ts` | Write `created_at` onto new manifest rows |
| `src/timeline/build.ts` | Hits → nodes, ticks, truncation |
| `src/timeline/mount.ts` | Stage DOM, stagger class, click handler |
| `src/style.css` | `.timeline-*` |
| `src/main.ts` | Rail, view, search, area chips, `openPage` |

Do not add a Netlify timeline endpoint. Do not change Graph behaviour.

---

### Task 1: Manifest carries `created_at`

**Files:**
- Modify: `src/domain/page.ts`
- Modify: `netlify/functions/_lib/dataRepo.ts`
- Test: `src/domain/page.test.ts`
- Test: `netlify/functions/_lib/dataRepo.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/page.test.ts`:

```ts
import { PageManifestEntrySchema } from "./page";

describe("PageManifestEntrySchema", () => {
  it("accepts a row without created_at", () => {
    expect(
      PageManifestEntrySchema.parse({
        id: "p",
        title: "Title",
        area: "notes",
        tags: [],
        excerpt: "Summary",
      }),
    ).toEqual({
      id: "p",
      title: "Title",
      area: "notes",
      tags: [],
      excerpt: "Summary",
    });
  });

  it("keeps created_at when present", () => {
    expect(
      PageManifestEntrySchema.parse({
        id: "p",
        title: "Title",
        area: "notes",
        tags: [],
        excerpt: "Summary",
        created_at: "2024-01-01T00:00:00.000Z",
      }).created_at,
    ).toBe("2024-01-01T00:00:00.000Z");
  });
});
```

In `netlify/functions/_lib/dataRepo.test.ts`, extend the `toManifestEntry` case:

```ts
it("copies created_at onto the manifest row", () => {
  expect(toManifestEntry(page).created_at).toBe("2024-01-01T00:00:00.000Z");
});
```

Keep the existing `parseManifest` test that omits `created_at` — it must still pass.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/page.test.ts netlify/functions/_lib/dataRepo.test.ts`

Expected: FAIL — `created_at` stripped / undefined on the manifest type.

- [ ] **Step 3: Minimal implementation**

In `src/domain/page.ts`, add to `PageManifestEntrySchema`:

```ts
created_at: z.string().datetime().optional(),
```

In `netlify/functions/_lib/dataRepo.ts`, include it in `toManifestEntry`:

```ts
export function toManifestEntry(page: Page): PageManifestEntry {
  const plain = page.body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
  return {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt: plain.slice(0, 157) + (plain.length > 157 ? "..." : ""),
    created_at: page.created_at,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/page.test.ts netlify/functions/_lib/dataRepo.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/page.ts src/domain/page.test.ts netlify/functions/_lib/dataRepo.ts netlify/functions/_lib/dataRepo.test.ts
git commit -m "Include note created_at on archive manifest rows."
```

---

### Task 2: Local listing keeps dates

**Files:**
- Modify: `src/api/localData.ts`
- Test: `src/api/localData.test.ts` (create)

There is no existing `localData.test.ts`. Add one that tests the normalizer in isolation by exporting a helper, **or** inline the same mapping in a tiny exported function. Prefer exporting `normalizeManifestRow` from `src/api/localData.ts` so the test does not need `fetch`.

- [ ] **Step 1: Write the failing test**

Create `src/api/localData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeManifestRow } from "./localData";

describe("normalizeManifestRow", () => {
  it("keeps created_at when the staged manifest has it", () => {
    expect(
      normalizeManifestRow({
        id: "p",
        title: "Title",
        area: "notes",
        tags: ["psychology"],
        excerpt: "Summary",
        path: "pages/p.json",
        created_at: "2024-06-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      id: "p",
      created_at: "2024-06-01T00:00:00.000Z",
    });
  });

  it("omits created_at when the staged row has none", () => {
    expect(
      normalizeManifestRow({
        id: "p",
        title: "Title",
        area: "notes",
        tags: [],
        excerpt: "Summary",
      }).created_at,
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/localData.test.ts`

Expected: FAIL — `normalizeManifestRow` is not exported.

- [ ] **Step 3: Minimal implementation**

In `src/api/localData.ts`:

```ts
export function normalizeManifestRow(entry: Record<string, unknown>) {
  return {
    id: entry.id,
    title: entry.title,
    area: entry.area,
    tags: entry.tags ?? [],
    excerpt: entry.excerpt ?? "",
    ...(typeof entry.created_at === "string" ? { created_at: entry.created_at } : {}),
  };
}
```

Use it inside `localListPages` in place of the inline object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/localData.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/localData.ts src/api/localData.test.ts
git commit -m "Keep created_at when reading the local archive manifest."
```

---

### Task 3: Migrator writes dates onto manifest rows

**Files:**
- Modify: `scripts/migrate-notion.ts`
- Test: `scripts/migrate-notion.test.ts` (only if a unit already covers `ManifestRow` construction; otherwise add a focused assertion on the incoming-row shape by exporting a helper)

Do **not** rewrite existing staged `manifest.json` in this task. New migrator runs include `created_at`.

If `scripts/migrate-notion.test.ts` has no hook for the incoming row object, add:

```ts
export function manifestRowFor(page: { id: string; title: string; area: PageArea; tags: string[]; created_at: string }, excerpt: string): ManifestRow {
  return {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt,
    path: `pages/${page.id}.json`,
    created_at: page.created_at,
  };
}
```

Use that in `main` when building `incomingManifest`. Extend `ManifestRow`:

```ts
export type ManifestRow = {
  id: string;
  title: string;
  area: PageArea;
  tags: string[];
  excerpt: string;
  path: string;
  created_at?: string;
};
```

- [ ] **Step 1: Write the failing test**

Add to `scripts/migrate-notion.test.ts`:

```ts
import { manifestRowFor } from "./migrate-notion";

it("puts created_at on a staged manifest row", () => {
  expect(
    manifestRowFor(
      {
        id: "page_x",
        title: "SDT",
        area: "notes",
        tags: ["psychology"],
        created_at: "2024-02-01T00:00:00.000Z",
      },
      "excerpt",
    ),
  ).toMatchObject({
    path: "pages/page_x.json",
    created_at: "2024-02-01T00:00:00.000Z",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/migrate-notion.test.ts`

Expected: FAIL — `manifestRowFor` missing or row has no `created_at`.

- [ ] **Step 3: Minimal implementation**

Add `manifestRowFor`, extend `ManifestRow`, and replace the inline `pages.map` manifest object with `manifestRowFor(page, excerptFor(page.description, page.body))`.

`scripts/retag.ts` `ManifestRow` may stay without `created_at` — `persistRetag` spreads the existing row and only overwrites `tags`, so dates already on disk survive.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/migrate-notion.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-notion.ts scripts/migrate-notion.test.ts
git commit -m "Write created_at onto newly migrated manifest rows."
```

---

### Task 4: Pure timeline layout

**Files:**
- Create: `src/timeline/build.ts`
- Create: `src/timeline/build.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/timeline/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TIMELINE_CAP, buildTimeline } from "./build";

const hit = (
  id: string,
  created_at?: string,
  title = id,
): Parameters<typeof buildTimeline>[0][number] => ({
  id,
  title,
  excerpt: title,
  area: "notes",
  created_at,
});

describe("buildTimeline", () => {
  it("returns empty nodes for no hits", () => {
    expect(buildTimeline([])).toMatchObject({ nodes: [], ticks: [], truncated: 0, total: 0, spanLabel: "" });
  });

  it("parks undated notes at t = 0 and sorts dated notes oldest to newest", () => {
    const model = buildTimeline([
      hit("c", "2024-06-01T00:00:00.000Z"),
      hit("u"),
      hit("a", "2023-01-01T00:00:00.000Z"),
    ]);
    expect(model.nodes.map(node => node.id)).toEqual(["u", "a", "c"]);
    expect(model.nodes[0]).toMatchObject({ undated: true, t: 0, dateLabel: "Undated" });
    expect(model.nodes[1].t).toBe(0);
    expect(model.nodes[2].t).toBe(1);
  });

  it("stacks same-day notes in increasing lanes", () => {
    const model = buildTimeline([
      hit("m", "2024-03-10T08:00:00.000Z"),
      hit("n", "2024-03-10T18:00:00.000Z"),
    ]);
    expect(model.nodes.map(node => node.lane)).toEqual([0, 1]);
    expect(model.nodes[0].t).toBe(model.nodes[1].t);
  });

  it("keeps the newest cap notes and reports truncation", () => {
    const hits = Array.from({ length: TIMELINE_CAP + 5 }, (_, index) =>
      hit(`p${index}`, `2020-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const model = buildTimeline(hits);
    expect(model.total).toBe(TIMELINE_CAP + 5);
    expect(model.truncated).toBe(5);
    expect(model.nodes).toHaveLength(TIMELINE_CAP);
    expect(model.nodes.at(-1)?.id).toBe(`p${TIMELINE_CAP + 4}`);
  });

  it("emits year ticks when the span is at least three years", () => {
    const model = buildTimeline([
      hit("a", "2019-06-01T00:00:00.000Z"),
      hit("b", "2024-06-01T00:00:00.000Z"),
    ]);
    expect(model.ticks.some(tick => tick.label === "2019")).toBe(true);
    expect(model.ticks.some(tick => tick.label === "2024")).toBe(true);
    expect(model.spanLabel).toMatch(/2019/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/timeline/build.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Minimal implementation**

Create `src/timeline/build.ts`:

```ts
import type { PageArea } from "../domain/page";

export const TIMELINE_CAP = 120;

export type TimelineHit = {
  id: string;
  title: string;
  excerpt: string;
  area: PageArea;
  created_at?: string;
};

export type TimelineNode = TimelineHit & {
  t: number;
  lane: number;
  undated: boolean;
  dateLabel: string;
};

export type TimelineTick = { t: number; label: string };

export type TimelineModel = {
  nodes: TimelineNode[];
  ticks: TimelineTick[];
  truncated: number;
  total: number;
  spanLabel: string;
};

function stamp(value?: string) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dateLabel(ms: number | null) {
  if (ms === null) return "Undated";
  return new Date(ms).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function yearLabel(ms: number) {
  return String(new Date(ms).getUTCFullYear());
}

function monthLabel(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function dayLabel(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ticksFor(min: number, max: number): TimelineTick[] {
  const span = max - min || 1;
  const tOf = (ms: number) => (ms - min) / span;
  const years = (max - min) / (365.25 * 24 * 3600 * 1000);
  const days = (max - min) / (24 * 3600 * 1000);
  const ticks: TimelineTick[] = [{ t: 0, label: years >= 3 ? yearLabel(min) : days >= 60 ? monthLabel(min) : dayLabel(min) }];
  if (years >= 3) {
    for (let year = new Date(min).getUTCFullYear() + 1; year < new Date(max).getUTCFullYear(); year++) {
      ticks.push({ t: tOf(Date.UTC(year, 0, 1)), label: String(year) });
    }
    if (yearLabel(max) !== yearLabel(min)) ticks.push({ t: 1, label: yearLabel(max) });
  } else if (days >= 60) {
    const cursor = new Date(Date.UTC(new Date(min).getUTCFullYear(), new Date(min).getUTCMonth(), 1));
    const end = new Date(max);
    while (cursor <= end) {
      ticks.push({ t: tOf(cursor.getTime()), label: monthLabel(cursor.getTime()) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    const cursor = new Date(Date.UTC(new Date(min).getUTCFullYear(), new Date(min).getUTCMonth(), new Date(min).getUTCDate()));
    const end = new Date(max);
    while (cursor <= end) {
      ticks.push({ t: tOf(cursor.getTime()), label: dayLabel(cursor.getTime()) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  if (!ticks.some(tick => tick.t === 1)) {
    ticks.push({
      t: 1,
      label: years >= 3 ? yearLabel(max) : days >= 60 ? monthLabel(max) : dayLabel(max),
    });
  }
  return ticks.filter(tick => tick.t >= 0 && tick.t <= 1);
}

export function buildTimeline(hits: TimelineHit[], cap = TIMELINE_CAP): TimelineModel {
  const ranked = [...hits].sort((a, b) => {
    const as = stamp(a.created_at);
    const bs = stamp(b.created_at);
    if (as === null && bs === null) return a.id.localeCompare(b.id);
    if (as === null) return -1;
    if (bs === null) return 1;
    return as - bs || a.id.localeCompare(b.id);
  });
  const truncated = Math.max(0, ranked.length - cap);
  const kept = ranked.slice(-cap);
  const dated = kept.map(hit => stamp(hit.created_at)).filter((ms): ms is number => ms !== null);
  const min = dated.length ? Math.min(...dated) : 0;
  const max = dated.length ? Math.max(...dated) : 0;
  const span = max - min || 1;
  const dayLanes = new Map<string, number>();
  const nodes: TimelineNode[] = kept.map(hit => {
    const ms = stamp(hit.created_at);
    const undated = ms === null;
    const key = undated ? "undated" : dayKey(ms);
    const lane = dayLanes.get(key) ?? 0;
    dayLanes.set(key, lane + 1);
    const t = undated || dated.length === 0 ? 0 : (ms - min) / span;
    return {
      ...hit,
      t,
      lane,
      undated,
      dateLabel: dateLabel(ms),
    };
  });
  const spanLabel =
    dated.length === 0
      ? kept.length
        ? "Undated"
        : ""
      : `${yearLabel(min)} → ${yearLabel(max)}`;
  return {
    nodes,
    ticks: dated.length ? ticksFor(min, max) : [],
    truncated,
    total: hits.length,
    spanLabel,
  };
}
```

Same-day notes share `t` because `t` is computed from the **day** start, not the exact timestamp — otherwise the same-day test (`t` equal) fails. Use day-start for `t`:

```ts
const dayMs = ms === null ? null : Date.parse(`${dayKey(ms)}T00:00:00.000Z`);
const t = undated || dated.length === 0 ? 0 : ((dayMs ?? min) - min) / span;
```

And compute `min`/`max` from unique day stamps, not raw hours.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/timeline/build.test.ts`

Expected: PASS. If same-day `t` still differs, switch `t` to day-start as above and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/timeline/build.ts src/timeline/build.test.ts
git commit -m "Lay matching notes on a chronological timeline model."
```

---

### Task 5: Mount timeline DOM and click-to-open

**Files:**
- Create: `src/timeline/mount.ts`
- Create: `src/timeline/mount.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/timeline/mount.test.ts` with a jsdom pragma:

```ts
/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "./build";
import { mountKeywordTimeline } from "./mount";

describe("mountKeywordTimeline", () => {
  it("opens the note when a node is clicked", () => {
    const host = document.createElement("div");
    const onPageClick = vi.fn();
    const model = buildTimeline([
      {
        id: "page_sdt",
        title: "Self-determination theory",
        excerpt: "autonomy",
        area: "notes",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    mountKeywordTimeline(host, { model, onPageClick });
    const button = host.querySelector<HTMLButtonElement>("[data-page-id='page_sdt']");
    expect(button).toBeTruthy();
    button?.click();
    expect(onPageClick).toHaveBeenCalledWith("page_sdt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/timeline/mount.test.ts`

Expected: FAIL — `mountKeywordTimeline` missing.

- [ ] **Step 3: Minimal implementation**

Create `src/timeline/mount.ts`:

```ts
import { escapeHtml } from "../lib/dom";
import type { TimelineModel } from "./build";

export function mountKeywordTimeline(
  host: HTMLElement,
  options: { model: TimelineModel; onPageClick: (pageId: string) => void },
) {
  const { model, onPageClick } = options;
  const maxLane = model.nodes.reduce((max, node) => Math.max(max, node.lane), 0);
  const height = 160 + maxLane * 56;
  host.innerHTML = `<div class="timeline" style="--timeline-height:${height}px">
    <div class="timeline__axis" aria-hidden="true"></div>
    <div class="timeline__ticks">
      ${model.ticks
        .map(
          tick =>
            `<span class="timeline__tick" style="left:${(tick.t * 100).toFixed(3)}%">${escapeHtml(tick.label)}</span>`,
        )
        .join("")}
    </div>
    <div class="timeline__nodes">
      ${model.nodes
        .map(
          (node, index) =>
            `<button class="timeline__node" type="button" data-page-id="${escapeHtml(node.id)}" style="left:${(node.t * 100).toFixed(3)}%; --lane:${node.lane}; --i:${Math.min(index, 23)}" title="${escapeHtml(node.title)}">
              <span class="timeline__node-title">${escapeHtml(node.title)}</span>
              <span class="timeline__node-date">${escapeHtml(node.dateLabel)}</span>
            </button>`,
        )
        .join("")}
    </div>
  </div>`;
  host.querySelectorAll<HTMLButtonElement>("[data-page-id]").forEach(button => {
    button.onclick = () => onPageClick(button.dataset.pageId!);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/timeline/mount.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/timeline/mount.ts src/timeline/mount.test.ts
git commit -m "Render timeline nodes as buttons that open notes."
```

---

### Task 6: Timeline CSS (Warm Cotton, reduced motion)

**Files:**
- Modify: `src/style.css`

No unit test. Visual check in `npm run dev`.

- [ ] **Step 1: Append styles**

Add at the end of `src/style.css`:

```css
.timeline-stage {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-4) var(--space-2) var(--space-8);
}

.timeline {
  position: relative;
  min-width: 720px;
  height: var(--timeline-height, 220px);
  margin: var(--space-6) 0 var(--space-4);
}

.timeline__axis {
  position: absolute;
  left: 1.5rem;
  right: 1.5rem;
  bottom: 2.25rem;
  height: 2px;
  background: var(--navy);
  transform-origin: left center;
  animation: timeline-axis 400ms ease both;
}

.timeline__ticks {
  position: absolute;
  inset: 0 1.5rem 0 1.5rem;
  pointer-events: none;
}

.timeline__tick {
  position: absolute;
  bottom: 0.35rem;
  transform: translateX(-50%);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--muted);
}

.timeline__nodes {
  position: absolute;
  inset: 0 1.5rem 2.25rem 1.5rem;
}

.timeline__node {
  position: absolute;
  bottom: calc(12px + (var(--lane, 0) * 56px));
  transform: translateX(-50%);
  min-width: 44px;
  min-height: 44px;
  max-width: 11rem;
  display: grid;
  gap: 0.15rem;
  justify-items: start;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--glass-strong);
  box-shadow: var(--elev-2);
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  animation: timeline-in 280ms ease both;
  animation-delay: calc(var(--i, 0) * 40ms);
}

.timeline__node:hover,
.timeline__node:focus-visible {
  outline: 2px solid var(--wave);
  outline-offset: 2px;
}

.timeline__node-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 1.25;
}

.timeline__node-date {
  font-size: var(--text-2xs);
  color: var(--muted);
}

@keyframes timeline-in {
  from {
    opacity: 0;
    translate: 0 12px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes timeline-axis {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .timeline__node,
  .timeline__axis {
    animation: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/style.css
git commit -m "Style the keyword timeline with Warm Cotton motion."
```

---

### Task 7: Timeline rail in the hub shell

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add view, icon, state, nav, and render**

1. Extend `View` with `"timeline"`.
2. Add state:

```ts
let timelineQuery = "";
let timelineArea: AreaFilter = "all";
let timelineBusy = false;
let timelineError = "";
let timelineTeardown: (() => void) | null = null;
```

3. Add a rail icon (simple nodes on a line) and a Timeline button after Graph, active when `view === "timeline"`.
4. In `shell()`, tear down `timelineTeardown` the same way as `graphTeardown`.
5. In the `[data-nav]` handler, add:

```ts
if (next === "timeline") {
  view = "timeline";
  activePage = null;
  render();
  return;
}
```

6. Add `renderTimeline()` and call it from `render()` before the list fallback:

```ts
function renderTimeline() {
  shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · reading migrated data · no Netlify deploy</p>` : ""}
    <header class="topbar">
      <div>
        <p class="eyebrow">Private archive</p>
        <h1>Timeline</h1>
      </div>
    </header>
    <div class="toolbar">
      <input class="search" value="${escapeHtml(timelineQuery)}" placeholder="Search a topic — e.g. self determination theory" aria-label="Search timeline" />
      <div class="filters">
        <button class="filter-chip ${timelineArea === "all" ? "is-active" : ""}" data-timeline-area="all" type="button">All</button>
        <button class="filter-chip ${timelineArea === "university" ? "is-active" : ""}" data-timeline-area="university" type="button">University</button>
        <button class="filter-chip ${timelineArea === "notes" ? "is-active" : ""}" data-timeline-area="notes" type="button">Notes</button>
      </div>
    </div>
    <p class="list-count">${timelineBusy ? "Searching…" : timelineError ? escapeHtml(timelineError) : ""}</p>
    <div class="timeline-stage" data-timeline-stage></div>
  `);

  const input = app.querySelector<HTMLInputElement>(".search")!;
  input.oninput = async event => {
    timelineQuery = (event.target as HTMLInputElement).value;
    await refreshTimeline();
    render();
    const next = app.querySelector<HTMLInputElement>(".search")!;
    next.focus();
    next.setSelectionRange(timelineQuery.length, timelineQuery.length);
  };
  app.querySelectorAll<HTMLButtonElement>("[data-timeline-area]").forEach(button => {
    button.onclick = () => {
      timelineArea = button.dataset.timelineArea as AreaFilter;
      void refreshTimeline().then(render);
    };
  });
  const stage = app.querySelector<HTMLElement>("[data-timeline-stage]")!;
  void paintTimeline(stage);
}

async function refreshTimeline() {
  timelineError = "";
}

async function paintTimeline(stage: HTMLElement) {
  const needle = timelineQuery.trim();
  if (!needle) {
    stage.innerHTML = `<p class="empty">Search a topic to see when those notes landed.</p>`;
    return;
  }
  timelineBusy = true;
  try {
    const hits = (await searchPages(needle)).filter(item => timelineArea === "all" || item.area === timelineArea);
    const model = buildTimeline(hits);
    const count =
      model.truncated > 0
        ? `Showing ${model.nodes.length} of ${model.total.toLocaleString()} notes${model.spanLabel ? ` · ${model.spanLabel}` : ""}`
        : `${model.total.toLocaleString()} notes${model.spanLabel ? ` · ${model.spanLabel}` : ""}`;
    const countEl = app.querySelector(".list-count");
    if (countEl) countEl.textContent = count;
    if (!model.nodes.length) {
      stage.innerHTML = `<p class="empty">No notes match.</p>`;
      return;
    }
    timelineTeardown = () => {
      stage.innerHTML = "";
    };
    mountKeywordTimeline(stage, {
      model,
      onPageClick: pageId => void openPage(pageId),
    });
  } catch (error) {
    timelineError = error instanceof Error ? error.message : "Search failed";
    showToast(timelineError);
    stage.innerHTML = `<p class="empty">${escapeHtml(timelineError)}</p>`;
  } finally {
    timelineBusy = false;
  }
}
```

Import `buildTimeline` and `mountKeywordTimeline`.

7. In `render()`:

```ts
if (view === "timeline") return renderTimeline();
```

Idle copy and zero-hit copy must match the spec exactly.

- [ ] **Step 2: Typecheck / unit tests still pass**

Run: `npx vitest run src/timeline src/domain/page.test.ts netlify/functions/_lib/dataRepo.test.ts src/api/localData.test.ts netlify/functions/search.test.ts`

Expected: PASS

- [ ] **Step 3: Manual check**

Run: `npm run dev`

Open Timeline, search `self determination theory` (or `stoicism` on fixtures). Confirm nodes animate, click opens the reader, rail returns to Timeline.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Add a Timeline rail for chronological note search."
```

---

### Task 8: Spec coverage check

Confirm against `docs/superpowers/specs/2026-08-15-keyword-timeline-design.md`:

| Requirement | Task |
| --- | --- |
| New Timeline rail, Graph unchanged | 7 |
| Reuse search, sort by `created_at` | 4, 7 |
| Optional manifest dates, local pass-through | 1, 2, 3 |
| Undated cluster at t=0 | 4 |
| Cap 120 newest, stagger first 24 | 4 (`slice(-cap)`), 5 (`--i` min 23) |
| Click / keyboard button opens `openPage` | 5, 7 |
| CSS motion + `prefers-reduced-motion` | 6 |
| Idle and zero-hit copy | 7 |
| No new API | — |

If any row is missing, fix it in the matching task before claiming done.

- [ ] **Step 1: Run the focused suite once more**

Run: `npx vitest run src/timeline src/domain/page.test.ts src/api/localData.test.ts netlify/functions/_lib/dataRepo.test.ts scripts/migrate-notion.test.ts netlify/functions/search.test.ts`

Expected: PASS
