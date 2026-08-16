# Show All and Universe View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Constellation · Show All · Universe modes on the existing Graph rail: an honest full note map, and a cheating orbital sky with a pulsing fake sun, without leaving today’s clustered graph as the default.

**Architecture:** Shared Graph chrome (mode row, search dimmer, pinned preview + up-arrow). Constellation and Show All share `mountForceGraph` + d3-force with different models. Universe is a second engine (`universeGraph` rails + `universeView` rAF loop). Mode switch always tears down the active mount before starting the other. Hub clicks never jump to the Archive list.

**Tech Stack:** TypeScript, Vitest, canvas 2d, d3-force (Constellation / Show All only), existing Vite app + Warm Cotton CSS.

**Spec:** `docs/superpowers/specs/2026-08-15-graph-universe-design.md`

---

## File structure

- Modify: `src/archive/keywordGraph.ts` — add `"overlap"` to `GraphLinkKind`
- Modify: `src/archive/graphFocus.ts` + `graphFocus.test.ts` — search matching, twin-copy colouring, leaf selection by `pageId`
- Create: `src/archive/showAllGraph.ts` + `showAllGraph.test.ts`
- Create: `src/archive/universeGraph.ts` + `universeGraph.test.ts`
- Create: `src/archive/graphPreview.ts` + `graphPreview.test.ts`
- Modify: `src/archive/forceGraph.ts` — `variant`, search, preview hooks, no list-jump, Show All camera
- Create: `src/archive/universeView.ts` + `universeView.test.ts` — rAF orbits, pulse, enter ease, teardown
- Modify: `src/main.ts` — `graphMode`, mode row, search field, mount/teardown
- Modify: `src/style.css` — mode row, search, preview card (toolbar must accept pointer events)

Do not add WebGL, planet textures, wiki-link edges, a new rail button, or persist camera.

---

### Task 1: Overlap link kind

**Files:**
- Modify: `src/archive/keywordGraph.ts`

- [ ] **Step 1: Add the link kind**

In `src/archive/keywordGraph.ts`, change:

```ts
export type GraphLinkKind = "backbone" | "orbit" | "spoke";
```

to:

```ts
export type GraphLinkKind = "backbone" | "orbit" | "spoke" | "overlap";
```

- [ ] **Step 2: Commit**

```bash
git add src/archive/keywordGraph.ts
git commit -m "Allow note-to-note overlap edges on the archive graph."
```

---

### Task 2: Search and twin-copy focus

**Files:**
- Modify: `src/archive/graphFocus.ts`
- Modify: `src/archive/graphFocus.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/archive/graphFocus.test.ts` (keep existing tests). Add imports for `nodeMatchesQuery`, `searchCluster`, `isFocusNode`:

```ts
import { isFocusLink, isFocusNode, nodeMatchesQuery, searchCluster, selectionCluster } from "./graphFocus";
```

Add nodes with twin copies:

```ts
const twins: GraphNodeDatum[] = [
  ...nodes,
  node({ id: "leaf:n1-b", kind: "leaf", label: "Note 1", pageId: "p1", parentKeyword: "B" }),
  node({ id: "leaf:n1", kind: "leaf", label: "Note 1", pageId: "p1", parentKeyword: "A" }),
];

describe("graph search", () => {
  it("matches keyword labels and note titles, not empty queries", () => {
    expect(nodeMatchesQuery(nodes[0], "")).toBe(true);
    expect(nodeMatchesQuery(nodes[0], "a")).toBe(true);
    expect(nodeMatchesQuery(nodes[0], "zzz")).toBe(false);
    expect(nodeMatchesQuery(nodes[5], "note")).toBe(true);
  });

  it("colours both twin copies of a matching note", () => {
    const cluster = searchCluster(twins, "note 1");
    expect(cluster.has("leaf:n1")).toBe(true);
    expect(cluster.has("leaf:n1-b")).toBe(true);
    expect(cluster.has("major:A")).toBe(false);
  });

  it("empty search colours everyone", () => {
    const cluster = searchCluster(twins, "  ");
    expect(cluster.size).toBe(0);
    expect(twins.every(item => isFocusNode(item, cluster) || cluster.size === 0)).toBe(true);
  });
});

describe("leaf selection by page", () => {
  it("keeps every copy of the selected note hot", () => {
    const cluster = selectionCluster(twins, "Note 1");
    expect(cluster.has("Note 1")).toBe(true);
    const copies = twins.filter(item => item.pageId === "p1");
    expect(copies.every(item => isFocusNode(item, cluster))).toBe(true);
  });
});
```

Fix the existing `leaf:n1` fixture to include `pageId: "p1"` so twin tests share an id:

```ts
node({ id: "leaf:n1", kind: "leaf", label: "Note 1", parentKeyword: "A", pageId: "p1" }),
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/archive/graphFocus.test.ts`

Expected: FAIL — `nodeMatchesQuery` / `searchCluster` are not exported.

- [ ] **Step 3: Implement**

Replace `src/archive/graphFocus.ts` with:

```ts
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

function nodeLabel(end: GraphLinkDatum["source"], nodes: GraphNodeDatum[]) {
  if (typeof end !== "string") return end.label;
  const node = nodes.find(item => item.id === end);
  return node?.label ?? end.replace(/^(major|minor|leaf):/, "");
}

export function nodeMatchesQuery(node: GraphNodeDatum, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return node.label.toLowerCase().includes(needle);
}

export function searchCluster(nodes: GraphNodeDatum[], query: string) {
  const needle = query.trim().toLowerCase();
  const cluster = new Set<string>();
  if (!needle) return cluster;
  for (const node of nodes) {
    if (nodeMatchesQuery(node, needle)) cluster.add(node.id);
  }
  const pageIds = new Set(nodes.filter(node => cluster.has(node.id) && node.pageId).map(node => node.pageId!));
  for (const node of nodes) {
    if (node.pageId && pageIds.has(node.pageId)) cluster.add(node.id);
  }
  return cluster;
}

export function selectionCluster(nodes: GraphNodeDatum[], selected: string | null) {
  const cluster = new Set<string>();
  if (!selected) return cluster;

  const selectedNodes = nodes.filter(node => node.label === selected || node.id === selected);
  if (!selectedNodes.length) return cluster;

  const pageIds = new Set(selectedNodes.map(node => node.pageId).filter(Boolean) as string[]);
  if (pageIds.size) {
    for (const node of nodes) {
      if (node.pageId && pageIds.has(node.pageId)) cluster.add(node.label);
    }
    return cluster;
  }

  const hub = selectedNodes.find(node => node.kind !== "leaf") ?? selectedNodes[0];
  cluster.add(hub.label);
  if (hub.kind === "major") {
    for (const node of nodes) {
      if (node.parentKeyword === hub.label) cluster.add(node.label);
    }
  }
  if (hub.kind === "minor" && hub.parentKeyword) {
    cluster.add(hub.parentKeyword);
    for (const node of nodes) {
      if (node.kind === "leaf" && node.parentKeyword === hub.label) cluster.add(node.label);
    }
  }
  return cluster;
}

export function isFocusLink(link: GraphLinkDatum, nodes: GraphNodeDatum[], cluster: Set<string>) {
  if (cluster.size === 0) return false;
  if (link.kind === "backbone") return false;
  const sourceLabel = nodeLabel(link.source, nodes);
  const targetLabel = nodeLabel(link.target, nodes);
  return cluster.has(sourceLabel) && cluster.has(targetLabel);
}

export function isFocusNode(node: GraphNodeDatum, cluster: Set<string>) {
  if (cluster.size === 0) return true;
  return cluster.has(node.label) || cluster.has(node.id);
}

export function isSearchHot(node: GraphNodeDatum, query: string, nodes: GraphNodeDatum[]) {
  const cluster = searchCluster(nodes, query);
  if (cluster.size === 0) return true;
  return cluster.has(node.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/archive/graphFocus.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/archive/graphFocus.ts src/archive/graphFocus.test.ts
git commit -m "Colour graph search hits and both copies of a note."
```

---

### Task 3: Show All graph model

**Files:**
- Create: `src/archive/showAllGraph.ts`
- Create: `src/archive/showAllGraph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/archive/showAllGraph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildShowAllGraph } from "./showAllGraph";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: `${title} excerpt` };
}

describe("buildShowAllGraph", () => {
  it("emits one node per note, spokes to each topic keyword, and overlap edges for shared tags", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", ["Educational Psychology", "Pedagogy"]),
      page("p2", "Beta", ["Educational Psychology", "Pedagogy"]),
      page("p3", "Gamma", ["Wellbeing"]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(new Set(leaves.map(node => node.id)).size).toBe(3);

    const spokes = model.links.filter(link => link.kind === "spoke");
    expect(spokes.filter(link => String(link.target) === "leaf:p1" || String(link.source) === "leaf:p1").length).toBe(2);

    const overlaps = model.links.filter(link => link.kind === "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].weight).toBe(2);

    expect(model.nodes.filter(node => node.kind === "major" || node.kind === "minor").every(node => node.r < 40)).toBe(true);
  });

  it("does not emit overlap edges for a single shared tag", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", ["Educational Psychology"]),
      page("p2", "Beta", ["Educational Psychology"]),
    ]);
    expect(model.links.every(link => link.kind !== "overlap")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/archive/showAllGraph.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/archive/showAllGraph.ts`:

```ts
import type { PageManifestEntry } from "../domain/page";
import { buildArchiveGraph, topicKeywords, type ArchiveGraphModel, type GraphLinkDatum, type GraphNodeDatum } from "./keywordGraph";

const OVERLAP_CAP = 800;

function endId(end: GraphLinkDatum["source"]) {
  return typeof end === "string" ? end : end.id;
}

export function buildShowAllGraph(entries: PageManifestEntry[]): ArchiveGraphModel {
  const base = buildArchiveGraph(entries);
  const hubs = base.nodes.map(node => ({
    ...node,
    r: node.kind === "major" ? Math.max(10, node.r * 0.45) : Math.max(7, node.r * 0.7),
  }));
  const hubByLabel = new Map(hubs.map(node => [node.label, node]));

  const tagged = entries.filter(entry => topicKeywords(entry.tags).length);
  const leaves: GraphNodeDatum[] = [];
  const spokes: GraphLinkDatum[] = [];
  const tagsByPage = new Map<string, string[]>();

  for (const entry of tagged) {
    const keywords = [...new Set(topicKeywords(entry.tags))];
    tagsByPage.set(entry.id, keywords);
    const owner = hubByLabel.get(keywords[0]) ?? hubs[0];
    if (!owner) continue;
    const leaf: GraphNodeDatum = {
      id: `leaf:${entry.id}`,
      kind: "leaf",
      label: entry.title,
      count: 1,
      pageId: entry.id,
      parentKeyword: owner.label,
      color: owner.color,
      soft: owner.soft,
      ink: owner.ink,
      r: 4.5,
    };
    leaves.push(leaf);
    for (const keyword of keywords) {
      const hub = hubByLabel.get(keyword);
      if (!hub) continue;
      spokes.push({
        source: hub.id,
        target: leaf.id,
        kind: "spoke",
        weight: 1,
        color: hub.color,
      });
    }
  }

  const overlapCandidates: GraphLinkDatum[] = [];
  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      const a = tagged[i];
      const b = tagged[j];
      const shared = (tagsByPage.get(a.id) ?? []).filter(tag => (tagsByPage.get(b.id) ?? []).includes(tag));
      if (shared.length < 2) continue;
      const hub = hubByLabel.get(shared[0]) ?? hubs[0];
      overlapCandidates.push({
        source: `leaf:${a.id}`,
        target: `leaf:${b.id}`,
        kind: "overlap",
        weight: shared.length,
        color: hub?.color ?? "#7eb0d5",
      });
    }
  }

  overlapCandidates.sort((a, b) => b.weight - a.weight);
  const overlaps = overlapCandidates.slice(0, OVERLAP_CAP);

  return {
    nodes: [...hubs, ...leaves],
    links: [...base.links, ...spokes, ...overlaps],
    majorCount: base.majorCount,
    minorCount: base.minorCount,
    leaves: base.leaves,
  };
}

export function overlapCount(model: ArchiveGraphModel) {
  return model.links.filter(link => link.kind === "overlap").length;
}

export { endId };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/archive/showAllGraph.test.ts`

Expected: PASS. If spokes fail because a tag is not in the top-8 majors (e.g. `"Pedagogy"` vs `"Pedagogy & Instructional Design"`), change the fixture tags to two labels that both survive `buildArchiveGraph` (use `"Educational Psychology"` and `"Wellbeing & Mental Health in Schools"` as the shared pair, plus a third unique major for Gamma). Keep the assertions: one leaf per note, two spokes from the two-tag note, one overlap of weight 2.

- [ ] **Step 5: Commit**

```bash
git add src/archive/showAllGraph.ts src/archive/showAllGraph.test.ts
git commit -m "Build a full-note Show All graph with overlap edges."
```

---

### Task 4: Universe rails model

**Files:**
- Create: `src/archive/universeGraph.ts`
- Create: `src/archive/universeGraph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/archive/universeGraph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildUniverseGraph, minorOrbitRadius } from "./universeGraph";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: "" };
}

describe("buildUniverseGraph", () => {
  it("places a fake sun, planets for majors, and twin moons for a two-keyword note", () => {
    const majors = [
      "Educational Psychology",
      "Pedagogy & Instructional Design",
      "Wellbeing & Mental Health in Schools",
      "Child Development & Wellbeing",
      "Learning Strategies",
      "Gifted Education",
      "Neurodiversity & Special Education",
      "Cognitive Neuroscience",
    ];
    const pages = majors.map((tag, index) => page(`m${index}`, `Major ${index}`, [tag, majors[(index + 1) % majors.length]]));
    pages.push(page("twin", "Twin note", ["Educational Psychology", "Gifted Education"]));
    pages.push(page("only", "Only psych", ["Educational Psychology"]));

    const model = buildUniverseGraph(pages);
    expect(model.bodies.some(body => body.kind === "sun")).toBe(true);
    expect(model.bodies.filter(body => body.kind === "planet")).toHaveLength(8);

    const twins = model.bodies.filter(body => body.pageId === "twin");
    expect(twins).toHaveLength(2);
    expect(new Set(twins.map(body => body.parentId)).size).toBe(2);

    const only = model.bodies.find(body => body.pageId === "only")!;
    const twinAroundPsych = twins.find(body => body.parentId === only.parentId)!;
    expect(only.orbitRadius).toBeLessThan(twinAroundPsych.orbitRadius);
  });

  it("puts stronger co-occurrence minors closer to their planet", () => {
    expect(minorOrbitRadius(8, 8)).toBeLessThan(minorOrbitRadius(1, 8));
  });

  it("still builds a sun when there are no topic keywords", () => {
    const model = buildUniverseGraph([page("x", "Empty", ["Note"])]);
    expect(model.bodies).toHaveLength(1);
    expect(model.bodies[0].kind).toBe("sun");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/archive/universeGraph.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/archive/universeGraph.ts`:

```ts
import type { PageManifestEntry } from "../domain/page";
import { buildArchiveGraph, topicKeywords } from "./keywordGraph";

export type UniverseBodyKind = "sun" | "planet" | "moon" | "note";

export type UniverseBody = {
  id: string;
  kind: UniverseBodyKind;
  label: string;
  parentId: string | null;
  pageId?: string;
  excerpt?: string;
  count: number;
  color: string;
  soft: string;
  ink: string;
  r: number;
  orbitRadius: number;
  periodSec: number;
  phase: number;
};

export type UniverseGraphModel = {
  bodies: UniverseBody[];
};

export function minorOrbitRadius(weight: number, maxWeight: number) {
  const t = maxWeight <= 0 ? 0 : weight / maxWeight;
  return 56 + (1 - t) * 70;
}

function hashPhase(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 1000;
  return (n / 1000) * Math.PI * 2;
}

export function buildUniverseGraph(entries: PageManifestEntry[]): UniverseGraphModel {
  const sun: UniverseBody = {
    id: "sun:hub",
    kind: "sun",
    label: "Hub",
    parentId: null,
    count: 0,
    color: "#ffb347",
    soft: "rgba(255, 179, 71, 0.35)",
    ink: "#6c581f",
    r: 18,
    orbitRadius: 0,
    periodSec: 0,
    phase: 0,
  };

  const base = buildArchiveGraph(entries);
  if (!base.nodes.length) return { bodies: [sun] };

  const planets: UniverseBody[] = base.nodes
    .filter(node => node.kind === "major")
    .map((node, index, list) => ({
      id: node.id,
      kind: "planet" as const,
      label: node.label,
      parentId: sun.id,
      count: node.count,
      color: node.color,
      soft: node.soft,
      ink: node.ink,
      r: Math.max(8, node.r * 0.42),
      orbitRadius: 420,
      periodSec: 160 + index * 11,
      phase: (Math.PI * 2 * index) / list.length - Math.PI / 2,
    }));

  const planetByLabel = new Map(planets.map(planet => [planet.label, planet]));
  const pairMax = Math.max(
    ...base.links.filter(link => link.kind === "orbit").map(link => link.weight),
    1,
  );

  const moons: UniverseBody[] = base.nodes
    .filter(node => node.kind === "minor")
    .map((node, index) => {
      const planet = planetByLabel.get(node.parentKeyword ?? "") ?? planets[0];
      const orbit = base.links.find(
        link => link.kind === "orbit" && String(link.target) === node.id,
      );
      return {
        id: node.id,
        kind: "moon" as const,
        label: node.label,
        parentId: planet?.id ?? sun.id,
        count: node.count,
        color: node.color,
        soft: node.soft,
        ink: node.ink,
        r: Math.max(5, node.r * 0.7),
        orbitRadius: minorOrbitRadius(orbit?.weight ?? 1, pairMax),
        periodSec: 38 + index * 2.4,
        phase: hashPhase(node.id),
      };
    });

  const parentByKeyword = new Map<string, UniverseBody>();
  for (const planet of planets) parentByKeyword.set(planet.label, planet);
  for (const moon of moons) parentByKeyword.set(moon.label, moon);

  const notes: UniverseBody[] = [];
  for (const entry of entries) {
    const keywords = [...new Set(topicKeywords(entry.tags))];
    if (!keywords.length) continue;
    const share = 1 / keywords.length;
    for (const keyword of keywords) {
      const parent = parentByKeyword.get(keyword);
      if (!parent) continue;
      notes.push({
        id: `note:${entry.id}:${keyword}`,
        kind: "note",
        label: entry.title,
        parentId: parent.id,
        pageId: entry.id,
        excerpt: entry.excerpt,
        count: 1,
        color: parent.color,
        soft: parent.soft,
        ink: parent.ink,
        r: 2.6,
        orbitRadius: 22 + (1 - share) * 36,
        periodSec: 14 + (hashPhase(entry.id + keyword) % 3) * 4,
        phase: hashPhase(entry.id + keyword),
      });
    }
  }

  return { bodies: [sun, ...planets, ...moons, ...notes] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/archive/universeGraph.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/archive/universeGraph.ts src/archive/universeGraph.test.ts
git commit -m "Model Universe View as a pulsing sun with orbital rails."
```

---

### Task 5: Pinned preview card

**Files:**
- Create: `src/archive/graphPreview.ts`
- Create: `src/archive/graphPreview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/archive/graphPreview.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { mountGraphPreview } from "./graphPreview";

describe("mountGraphPreview", () => {
  it("shows a card with an up-arrow control that opens the note, and clears on clear()", () => {
    const host = document.createElement("div");
    const onOpen = vi.fn();
    const preview = mountGraphPreview(host, { onOpen });
    expect(host.querySelector(".graph-preview")).toBeTruthy();
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(true);

    preview.show({ pageId: "p1", title: "Twin note", excerpt: "Hello excerpt" });
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(false);
    expect(host.textContent).toContain("Twin note");
    expect(host.textContent).toContain("Hello excerpt");

    const open = host.querySelector<HTMLButtonElement>("[data-open-note]")!;
    expect(open.getAttribute("aria-label")).toBe("Read full note");
    open.click();
    expect(onOpen).toHaveBeenCalledWith("p1");

    preview.clear();
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/archive/graphPreview.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/archive/graphPreview.ts`:

```ts
export type GraphPreviewNote = {
  pageId: string;
  title: string;
  excerpt: string;
};

export type GraphPreviewHandlers = {
  onOpen: (pageId: string) => void;
};

export function mountGraphPreview(host: HTMLElement, handlers: GraphPreviewHandlers) {
  const card = document.createElement("div");
  card.className = "graph-preview";
  card.hidden = true;
  card.innerHTML = `
    <div class="graph-preview__body">
      <p class="graph-preview__title"></p>
      <p class="graph-preview__excerpt"></p>
    </div>
    <button class="graph-preview__open" data-open-note type="button" aria-label="Read full note">
      <span aria-hidden="true">↑</span>
    </button>
  `;
  host.appendChild(card);

  let current: GraphPreviewNote | null = null;
  const titleEl = card.querySelector<HTMLElement>(".graph-preview__title")!;
  const excerptEl = card.querySelector<HTMLElement>(".graph-preview__excerpt")!;
  const openBtn = card.querySelector<HTMLButtonElement>("[data-open-note]")!;

  openBtn.onclick = () => {
    if (current) handlers.onOpen(current.pageId);
  };

  function show(note: GraphPreviewNote) {
    current = note;
    titleEl.textContent = note.title;
    excerptEl.textContent = note.excerpt;
    card.hidden = false;
  }

  function clear() {
    current = null;
    card.hidden = true;
  }

  return { show, clear, el: card };
}
```

- [ ] **Step 4: Add CSS**

Append to `src/style.css`:

```css
.graph-preview {
  position: absolute;
  z-index: 4;
  left: var(--space-4);
  right: var(--space-4);
  bottom: var(--space-4);
  display: flex;
  align-items: stretch;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(251, 248, 242, 0.94);
  border: 1px solid var(--line);
  box-shadow: var(--elev-2);
}

.graph-preview[hidden] {
  display: none;
}

.graph-preview__body {
  min-width: 0;
  flex: 1;
}

.graph-preview__title {
  margin: 0;
  font-weight: var(--weight-semibold);
}

.graph-preview__excerpt {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.graph-preview__open {
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  background: var(--navy);
  color: #fff;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/archive/graphPreview.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/archive/graphPreview.ts src/archive/graphPreview.test.ts src/style.css
git commit -m "Pin a graph note preview with a read-full-note control."
```

---

### Task 6: Force graph — Show All, search, no list jump

**Files:**
- Modify: `src/archive/forceGraph.ts`

- [ ] **Step 1: Extend the mount API**

In `src/archive/forceGraph.ts`, change `ForceGraphHandlers` and `mountForceGraph` signature to:

```ts
export type ForceGraphVariant = "constellation" | "showAll";

export type ForceGraphHandlers = {
  onNoteSelect: (note: { pageId: string; title: string; excerpt: string } | null) => void;
};

export type ForceGraphOptions = {
  variant: ForceGraphVariant;
  search: string;
  excerptFor: (pageId: string) => string;
};
```

Remove `onKeywordFilter` and `onPageClick` from this module. Call `handlers.onNoteSelect(note | null)` instead of opening the page or jumping to the list.

- [ ] **Step 2: Click behaviour**

Replace the `pointerup` hub/leaf branch:

- If `options.variant === "constellation"` and the node is major/minor: keep `focusMajor` / `expandMinor`. Do **not** call a list filter on double-click.
- If `options.variant === "showAll"` and the node is major/minor: set `selected` to the hub label (grey-focus via existing `selectionCluster`); do not attach leaves (Show All already has every note).
- If the node is a leaf with `pageId`: set `selected` to the note label, call `handlers.onNoteSelect({ pageId, title: node.label, excerpt: options.excerptFor(pageId) })`.
- Click empty canvas (pointerup with no `dragged` node, or pointerup on background after a pan with movement `< 4px`): `selected = null`; `handlers.onNoteSelect(null)`.

Update hover tip copy so it never mentions double-click for list.

- [ ] **Step 3: Search dimming**

In `draw()`, after computing `cluster` from `selectionCluster`:

```ts
import { isFocusLink, isFocusNode, isSearchHot, searchCluster, selectionCluster } from "./graphFocus";

const query = options.search;
const searchHits = searchCluster(simNodes, query);
const searching = searchHits.size > 0;
```

For each node, `hot` colour stays if `isSearchHot(node, query, simNodes)` when searching, else existing focus logic. When searching, ignore expand-selection dimming and grey anything not in `searchHits` (use `isSearchHot`). Links: grey unless both ends are search-hot, or (when not searching) existing `isFocusLink`.

Draw `"overlap"` links like backbone but slightly stronger (`globalAlpha` 0.28, width from weight).

- [ ] **Step 4: Show All camera**

When `options.variant === "showAll"`, initialise `view.k = 0.34` (more zoomed out than `0.62`). After the simulation’s first `'end'` event, fit `view` so all nodes sit in the canvas with padding. Constellation keeps the current initial view.

Do not attach sampled leaves on Show All mount.

- [ ] **Step 5: Keyboard**

On `keydown` Enter, if `selected` is a leaf with `pageId`, call `onNoteSelect` again (preview already shown; `main.ts` will open on the button — Enter on the canvas should also `onNoteSelect` so the preview’s open handler can be triggered from main). Simpler: dispatch the same `onNoteSelect` payload; main treats a second select as stay-on-card. Opening is only the up-arrow and a document-level Enter when the preview is visible (Task 8).

- [ ] **Step 6: Typecheck**

Run: `npx vitest run src/archive/graphFocus.test.ts src/archive/showAllGraph.test.ts`

Then fix `src/main.ts` compile errors in the next task if this task leaves `mountForceGraph` callers broken — do not leave the tree uncompilable. Temporarily keep a shim:

```ts
onKeywordFilter?: (keyword: string) => void;
onPageClick?: (pageId: string) => void;
```

and stop calling them. Remove the shim in Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/archive/forceGraph.ts
git commit -m "Keep graph hub clicks on the canvas and dim by search."
```

---

### Task 7: Universe view engine

**Files:**
- Create: `src/archive/universeView.ts`
- Create: `src/archive/universeView.test.ts`

- [ ] **Step 1: Write the failing teardown test**

Create `src/archive/universeView.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildUniverseGraph } from "./universeGraph";
import { mountUniverseView } from "./universeView";

describe("mountUniverseView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancels its animation frame on teardown so a second mount cannot leave two loops", () => {
    const frames: number[] = [];
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      id += 1;
      frames.push(id);
      queueMicrotask(() => cb(16));
      return id;
    });
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));

    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800 });
    const model = buildUniverseGraph([]);
    const first = mountUniverseView(host, model, { search: "", onNoteSelect() {} });
    first();
    expect(cancel).toHaveBeenCalled();
    host.innerHTML = "";
    const second = mountUniverseView(host, model, { search: "", onNoteSelect() {} });
    second();
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/archive/universeView.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `positionAt` and the mount**

Create `src/archive/universeView.ts`. Keep drawing in this file; keep math testable:

```ts
export function positionAt(
  body: UniverseBody,
  byId: Map<string, UniverseBody & { x: number; y: number }>,
  timeSec: number,
  freeze: boolean,
) {
  if (!body.parentId) return { x: 0, y: 0 };
  const parent = byId.get(body.parentId);
  const origin = parent ?? { x: 0, y: 0 };
  const angle = body.phase + (freeze || body.periodSec === 0 ? 0 : (timeSec / body.periodSec) * Math.PI * 2);
  return {
    x: origin.x + Math.cos(angle) * body.orbitRadius,
    y: origin.y + Math.sin(angle) * body.orbitRadius,
  };
}
```

`mountUniverseView(host, model, { search, onNoteSelect })`:

- Build a canvas + tip like `forceGraph` (copy the host/canvas/tip setup; do not start d3-force).
- World origin at (0, 0) = sun.
- Each frame: `timeSec = freeze ? 0 : (now - start) / 1000`. Resolve bodies parent-first (sun, planets, moons, notes). Sun pulse: `r * (1 + 0.06 * Math.sin(timeSec * Math.PI * 2 * 0.6))` unless `matchMedia("(prefers-reduced-motion: reduce)").matches` — then freeze angles, skip pulse, skip enter ease.
- Enter camera: animate `view.k` from `0.22` to `0.42` and centre the sun over ~800ms ease-out unless reduced motion.
- Draw no note–note lines. Optional very faint planet ring (alpha 0.08). Notes: no title unless hover or `view.k > 1.1`.
- If `kind === "note"` count > 1500, skip filling notes whose canvas distance from view centre is beyond the nearest 1500 (still hit-testable if you keep a spatial hash; simplest: sort by distance to view centre, draw 1500, still include search-hot notes).
- Search: `nodeMatchesQuery`-style on `body.label`; twin copies share `pageId` — if one matches, colour all with that `pageId`. Sun never matches; when searching, sun stays at 0.35 alpha.
- Click note: `onNoteSelect({ pageId, title, excerpt })`. Click planet/moon: set `selectedId` to that body (grey everything not in its subtree: descendants whose parent chain includes it). Click sun: bump pulse amplitude for 1.2s, no select. Click empty: `onNoteSelect(null)` and clear selected.
- Pan/zoom same as force graph (`toWorld`, wheel, pointer drag).
- Return teardown: `cancelAnimationFrame`, `host.innerHTML = ""`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/archive/universeView.test.ts src/archive/universeGraph.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/archive/universeView.ts src/archive/universeView.test.ts
git commit -m "Render Universe View as a 60fps orbital canvas."
```

---

### Task 8: Wire Graph chrome in main

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`

- [ ] **Step 1: State**

Near other view state in `src/main.ts`:

```ts
type GraphMode = "constellation" | "showAll" | "universe";
let graphMode: GraphMode = "constellation";
let graphSearch = "";
```

- [ ] **Step 2: Replace `renderGraph`**

```ts
function renderGraph() {
  const constellation = buildArchiveGraph(entries);
  const excerptFor = (pageId: string) => entries.find(entry => entry.id === pageId)?.excerpt ?? "";

  const meta =
    graphMode === "constellation"
      ? `${constellation.majorCount} majors · ${constellation.minorCount} sub-themes · click a hub to open its constellation`
      : graphMode === "showAll"
        ? "Every note · hubs as landmarks · lines where notes share tags"
        : "Universe View · a fake sun · planets and moons";

  const searchHint = graphSearch.trim() ? ` · search “${escapeHtml(graphSearch.trim())}”` : "";

  shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · graph stays on this canvas</p>` : ""}
    <header class="topbar">
      <div>
        <p class="eyebrow">Private archive</p>
        <h1>Keyword graph</h1>
      </div>
      <div class="viewbar">
        <button class="viewbar__btn" data-jump-list type="button">List</button>
        <button class="viewbar__btn is-active" type="button">Graph</button>
      </div>
    </header>
    <div class="graph-wrap">
      <div class="graph-toolbar glass-panel">
        <div class="graph-modes">
          <button type="button" data-graph-mode="constellation" class="${graphMode === "constellation" ? "is-active" : ""}">Constellation</button>
          <button type="button" data-graph-mode="showAll" class="${graphMode === "showAll" ? "is-active" : ""}">Show All</button>
          <button type="button" data-graph-mode="universe" class="${graphMode === "universe" ? "is-active" : ""}">Universe</button>
        </div>
        <input class="graph-search" type="search" placeholder="Search keywords and notes" value="${escapeHtml(graphSearch)}" />
        <p class="graph-toolbar__meta">${meta}${searchHint}</p>
      </div>
      <div class="graph-stage"></div>
    </div>
  `);

  app.querySelector<HTMLButtonElement>("[data-jump-list]")!.onclick = () => {
    view = "list";
    render();
  };

  app.querySelectorAll<HTMLButtonElement>("[data-graph-mode]").forEach(button => {
    button.onclick = () => {
      graphMode = button.dataset.graphMode as GraphMode;
      render();
    };
  });

  const search = app.querySelector<HTMLInputElement>(".graph-search")!;
  search.oninput = () => {
    graphSearch = search.value;
    render();
    const next = app.querySelector<HTMLInputElement>(".graph-search")!;
    next.focus();
    next.setSelectionRange(graphSearch.length, graphSearch.length);
  };

  const stage = app.querySelector<HTMLElement>(".graph-stage")!;
  if (graphTeardown) graphTeardown();
  const preview = mountGraphPreview(stage, { onOpen: pageId => void openPage(pageId) });

  const onNoteSelect = (note: { pageId: string; title: string; excerpt: string } | null) => {
    if (!note) {
      preview.clear();
      return;
    }
    preview.show({ ...note, excerpt: note.excerpt || excerptFor(note.pageId) });
  };

  document.onkeydown = event => {
    if (event.key !== "Enter") return;
    const open = stage.querySelector<HTMLButtonElement>("[data-open-note]");
    if (open && !preview.el.hidden) open.click();
  };

  if (graphMode === "universe") {
    graphTeardown = () => {
      document.onkeydown = null;
      stopUniverse();
    };
    const stopUniverse = mountUniverseView(stage, buildUniverseGraph(entries), {
      search: graphSearch,
      onNoteSelect,
    });
    const previous = graphTeardown;
    graphTeardown = () => {
      document.onkeydown = null;
      stopUniverse();
    };
    void previous;
  } else {
    const model = graphMode === "showAll" ? buildShowAllGraph(entries) : constellation;
    const stopForce = mountForceGraph(stage, model, { onNoteSelect }, { variant: graphMode, search: graphSearch, excerptFor });
    graphTeardown = () => {
      document.onkeydown = null;
      stopForce();
    };
  }
}
```

Fix the Universe teardown so there is a single `graphTeardown` assignment (do not double-wrap). Pattern:

```ts
let stop = () => {};
if (graphMode === "universe") {
  stop = mountUniverseView(stage, buildUniverseGraph(entries), { search: graphSearch, onNoteSelect });
} else {
  const model = graphMode === "showAll" ? buildShowAllGraph(entries) : constellation;
  stop = mountForceGraph(stage, model, { onNoteSelect }, { variant: graphMode, search: graphSearch, excerptFor });
}
graphTeardown = () => {
  document.onkeydown = null;
  stop();
};
```

If `graphSearch.trim()` has matches, set toolbar meta suffix ` · no matches` when the active model has zero hits. Compute hits with `searchCluster` on constellation/show-all nodes, or universe bodies’ labels. Do not empty the canvas.

Remove `onKeywordFilter` from this caller.

Import `buildShowAllGraph`, `buildUniverseGraph`, `mountUniverseView`, `mountGraphPreview`, `searchCluster`.

- [ ] **Step 3: CSS for chrome**

Update `.graph-toolbar` so it can receive clicks (it is currently `pointer-events: none`):

```css
.graph-toolbar {
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  max-width: calc(100% - 2rem);
}

.graph-toolbar__meta {
  margin: 0;
  flex: 1 1 12rem;
  pointer-events: none;
}

.graph-modes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.graph-modes button {
  border: 1px solid var(--line);
  background: transparent;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-weight: var(--weight-semibold);
}

.graph-modes button.is-active {
  background: var(--navy);
  color: #fff;
  border-color: var(--navy);
}

.graph-search {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
  min-width: 12rem;
  background: #fff;
}
```

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run src/archive`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/style.css src/archive/forceGraph.ts
git commit -m "Add Constellation, Show All, and Universe controls on Graph."
```

---

### Task 9: Manual WOW pass and empty states

**Files:**
- Modify: `src/archive/universeView.ts` only if the first paint is jittery or the sun is invisible
- Modify: `src/main.ts` empty copy if `buildArchiveGraph` returns no hubs

- [ ] **Step 1: Local preview**

Run: `npm run dev`

Open Graph. Confirm:

1. Default is Constellation; expand still works; double-click does **not** go to the list.
2. Show All shows every note, smaller hubs, overlap lines, zoomed out.
3. Universe: gold pulsing sun, slow planets, moons, twin copies for multi-tag notes, cinematic ease-in.
4. Search greys non-matches in all three; both twin moons stay coloured.
5. Click a note: preview + ↑ opens the reader.
6. Mode switch: only one animation loop (no accelerating orbits after toggling Universe twice).
7. `prefers-reduced-motion`: freeze Universe.

- [ ] **Step 2: Empty archive**

If there are no topic keywords, Universe still shows the sun; mode row stays visible. Add a one-line empty hint in the toolbar meta when `constellation.majorCount === 0`.

- [ ] **Step 3: Commit if anything changed**

```bash
git add src/archive/universeView.ts src/main.ts
git commit -m "Keep Universe View smooth and usable on an empty archive."
```

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| Mode row Constellation · Show All · Universe | 8 |
| Search greys, nodes stay | 2, 6, 7, 8 |
| Preview + up-arrow | 5, 8 |
| Constellation expand; Show All/Universe grey-focus | 6, 7 |
| Never jump to list | 6, 8 |
| Show All unique notes, overlap ≥ 2, cap 800, smaller hubs | 3, 6 |
| Fake pulsing sun, planets, minor rails, twin moons | 4, 7 |
| Reduced motion freeze | 7 |
| 1500 nearest notes LOD | 7 |
| Teardown one loop | 7, 8 |
| Empty sun-only Universe | 4, 9 |
