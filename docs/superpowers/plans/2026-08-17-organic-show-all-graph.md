# Organic Show All Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Show All’s concentric fixed layout with a deterministic, well-separated clustered force map that settles briefly and then locks.

**Architecture:** `showAllGraph.ts` will calculate cluster sizes, separated major-hub anchors, and deterministic organic seed positions. `forceGraphBehavior.ts` will expose the Show All force profile as pure tested configuration, while `showAllSimulation.ts` will be the shared simulation builder used by production and outcome-level tests. `forceGraph.ts` will run all Show All nodes through that simulation for a bounded tick budget, keep major anchors fixed, then lock every settled node.

**Tech Stack:** TypeScript, D3 Force, Canvas 2D, Vitest, Vite

---

### Task 1: Seed separated organic clusters

**Files:**
- Modify: `src/archive/showAllGraph.ts`
- Test: `src/archive/showAllGraph.test.ts`

- [ ] **Step 1: Replace the spiral-layout expectations with failing cluster-layout tests**

Add assertions that major-hub pair distances exceed the sum of their estimated cluster clearances, large note groups receive larger clearances, and leaf seed coordinates are distinct but remain close to their primary hub.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/archive/showAllGraph.test.ts`

Expected: FAIL because cluster clearance metadata/helpers and organic seed behavior do not exist.

- [ ] **Step 3: Implement deterministic cluster anchors and note seeds**

In `showAllGraph.ts`:

- count eligible notes by primary major hub;
- derive a bounded footprint from `sqrt(noteCount)`;
- place major anchors around a deterministic loose ring whose radius includes the two largest footprints;
- place minor nodes near their owning major;
- seed leaves using an id-derived angle and radius inside their primary cluster;
- keep overlap generation and its 800-edge cap unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/archive/showAllGraph.test.ts`

Expected: PASS.

### Task 2: Define a connection profile that cannot collapse clusters

**Files:**
- Modify: `src/archive/forceGraphBehavior.ts`
- Test: `src/archive/forceGraphBehavior.test.ts`

- [ ] **Step 1: Write failing tests for Show All force parameters**

Assert that:

- spokes are stronger and shorter than overlaps;
- overlap strength is capped and remains low regardless of edge weight;
- major collision clearance exceeds leaf and minor clearance;
- spoke distance scales with the owning hub’s note count;
- Show All simulations include leaves.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/archive/forceGraphBehavior.test.ts`

Expected: FAIL because the profile helpers do not exist and leaves are currently excluded.

- [ ] **Step 3: Implement pure force-profile helpers**

Export helpers for link distance, link strength, node charge, collision radius, cluster target strength, and the fixed Show All settle tick budget. Use approximately:

- local spokes: strong, short;
- cross-note overlaps: weak, long;
- majors: strongest repulsion and fixed hub collision clearance; cluster separation comes from footprint-scaled anchor spacing and adaptive spokes;
- leaves: modest collision and local target pull.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/archive/forceGraphBehavior.test.ts`

Expected: PASS.

### Task 3: Settle and lock Show All

**Files:**
- Create: `src/archive/showAllSimulation.ts`
- Create: `src/archive/showAllSimulation.test.ts`
- Modify: `src/archive/forceGraph.ts`
- Test: `src/archive/forceGraphBehavior.test.ts`

- [ ] **Step 1: Add a failing test for bounded settling**

Test the exported lock predicate/helper so it locks at the configured tick budget and not before it. Add an outcome-level test with dense cross-cluster overlap links that runs the production simulation for the full budget and verifies visible gaps remain between settled cluster bounds.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/archive/forceGraphBehavior.test.ts`

Expected: FAIL because bounded settling is not implemented.

- [ ] **Step 3: Wire the Show All simulation**

Implement the shared simulation builder and use it from Show All:

- include leaves in the simulation;
- fix major hubs at their seeded anchor positions;
- apply adaptive spoke distances plus link, charge, collision, and per-node cluster-target forces using the tested profile;
- count ticks, then assign `fx`/`fy` to all nodes and stop;
- continue drawing on simulation ticks;
- preserve manual node drag without restarting the settled map.

- [ ] **Step 4: Run focused archive tests**

Run: `npm test -- src/archive/showAllGraph.test.ts src/archive/forceGraphBehavior.test.ts`

Expected: PASS.

### Task 4: Verify the complete change

**Files:**
- Verify: all changed source, tests, specification, and plan files

- [ ] **Step 1: Run all unit tests**

Run: `npm run test:unit`

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Vite build exits 0 and writes `dist/`.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors; only intended outstanding work is present.

- [ ] **Step 4: Commit all outstanding work on `main`**

Stage all outstanding files requested by the user and create one repository-style commit describing the Universe orbit improvements and organic Show All graph.
