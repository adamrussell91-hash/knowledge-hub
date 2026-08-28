import { afterEach, describe, expect, it } from "vitest";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import {
  SHOW_ALL_SETTLE_TICKS,
  SHOW_ALL_TUNING_CONTROLS,
  SHOW_ALL_TUNING_DEFAULTS,
  SHOW_ALL_STRAND_WIDTH,
  applyShowAllStrandStroke,
  applyForceStageResize,
  applyShowAllTuning,
  fitViewToNodes,
  showAllLabelVisible,
  focusViewOnNode,
  initialForceView,
  isGraphSearching,
  linkDrawState,
  nodeDrawState,
  canvasRadius,
  nodeHoverTip,
  overlapLinkAlpha,
  resetShowAllTuning,
  showAllStrandDash,
  showAllStrandStroke,
  showAllStrandWidth,
  resolveBackgroundClick,
  resolveEnterKey,
  resolveNodeClick,
  showAllLinkShouldDraw,
  showAllCollisionRadius,
  showAllLinkDistance,
  showAllLinkStrength,
  showAllNodeCharge,
  showAllTuning,
  showAllTuningRestarts,
  shouldLockShowAll,
  simulationNodes,
  sliderValueForTuning,
  tuningFromSlider,
} from "./forceGraphBehavior";

function node(partial: Partial<GraphNodeDatum> & Pick<GraphNodeDatum, "id" | "kind" | "label">): GraphNodeDatum {
  return {
    count: 1,
    color: "#7eb0d5",
    soft: "rgba(126, 176, 213, 0.7)",
    ink: "#315875",
    r: 10,
    ...partial,
  };
}

const major = node({ id: "major:A", kind: "major", label: "A", count: 4 });
const minor = node({ id: "minor:a1", kind: "minor", label: "a1", parentKeyword: "A" });
const leaf = node({ id: "leaf:n1", kind: "leaf", label: "Note 1", parentKeyword: "a1", pageId: "p1" });
const otherMajor = node({ id: "major:B", kind: "major", label: "B" });
const nodes: GraphNodeDatum[] = [major, minor, leaf, otherMajor];

const excerptFor = (pageId: string) => `${pageId} excerpt`;

describe("force graph clicks", () => {
  it("keeps constellation hubs on the canvas and never list-filters", () => {
    expect(resolveNodeClick("constellation", major, null, excerptFor)).toEqual({
      kind: "expandHub",
      label: "A",
    });
    expect(resolveNodeClick("constellation", minor, null, excerptFor)).toEqual({
      kind: "expandHub",
      label: "a1",
    });
  });

  it("grey-focuses Show All hubs without attaching leaves", () => {
    expect(resolveNodeClick("showAll", major, null, excerptFor)).toEqual({
      kind: "selectHub",
      selected: "A",
    });
    expect(resolveNodeClick("showAll", minor, "a1", excerptFor)).toEqual({
      kind: "selectHub",
      selected: null,
    });
  });

  it("selects a leaf note for the preview card", () => {
    expect(resolveNodeClick("constellation", leaf, null, excerptFor)).toEqual({
      kind: "selectNote",
      selected: "Note 1",
      note: { pageId: "p1", title: "Note 1", excerpt: "p1 excerpt" },
    });
  });

  it("clears selection on an empty click or a pan under 4px", () => {
    expect(resolveBackgroundClick(0)).toBe("clear");
    expect(resolveBackgroundClick(3.9)).toBe("clear");
    expect(resolveBackgroundClick(4)).toBe("ignore");
  });

  it("re-emits the selected leaf on Enter", () => {
    expect(resolveEnterKey("Note 1", nodes, excerptFor)).toEqual({
      pageId: "p1",
      title: "Note 1",
      excerpt: "p1 excerpt",
    });
    expect(resolveEnterKey("A", nodes, excerptFor)).toBeNull();
  });
});

describe("force graph search dimming", () => {
  it("treats any non-empty query as searching, including zero matches", () => {
    expect(isGraphSearching("")).toBe(false);
    expect(isGraphSearching("  ")).toBe(false);
    expect(isGraphSearching("zzz")).toBe(true);
  });

  it("greys every node for a zero-match query", () => {
    for (const item of nodes) {
      expect(nodeDrawState(item, { query: "zzz", nodes, selected: "A", hover: item })).toEqual({
        hot: false,
        dim: true,
      });
    }
  });

  it("ignores expand-selection dimming while searching", () => {
    expect(nodeDrawState(leaf, { query: "note", nodes, selected: "B", hover: null })).toEqual({
      hot: true,
      dim: false,
    });
    expect(nodeDrawState(otherMajor, { query: "note", nodes, selected: "B", hover: null })).toEqual({
      hot: false,
      dim: true,
    });
  });

  it("uses selection focus when not searching", () => {
    expect(nodeDrawState(minor, { query: "", nodes, selected: "A", hover: null })).toEqual({
      hot: true,
      dim: false,
    });
    expect(nodeDrawState(otherMajor, { query: "", nodes, selected: "A", hover: null })).toEqual({
      hot: false,
      dim: true,
    });
  });

  it("keeps a matching note's spokes even when the hub title does not match", () => {
    const spoke: GraphLinkDatum = {
      source: "major:A",
      target: "leaf:n1",
      kind: "spoke",
      weight: 1,
      color: "#7eb0d5",
    };
    expect(linkDrawState(spoke, major, leaf, { query: "note", nodes, selected: null, hover: null })).toEqual({
      active: true,
      dim: false,
    });
  });

  it("keeps a selected note's spokes to its topic hubs", () => {
    const spoke: GraphLinkDatum = {
      source: "major:A",
      target: "leaf:n1",
      kind: "spoke",
      weight: 1,
      color: "#7eb0d5",
    };
    expect(linkDrawState(spoke, major, leaf, { query: "", nodes, selected: "Note 1", hover: null })).toEqual({
      active: true,
      dim: false,
    });
  });

  it("still greys links that do not touch a search-hot node", () => {
    const otherLeaf = node({ id: "leaf:n2", kind: "leaf", label: "Other", pageId: "p2" });
    const spoke: GraphLinkDatum = {
      source: "major:B",
      target: "leaf:n2",
      kind: "spoke",
      weight: 1,
      color: "#7eb0d5",
    };
    expect(linkDrawState(spoke, otherMajor, otherLeaf, { query: "note", nodes, selected: null, hover: null })).toEqual({
      active: false,
      dim: true,
    });
  });
});

describe("force graph chrome", () => {
  it("never mentions double-click for the list in hover tips", () => {
    expect(nodeHoverTip(major)).toBe("A · 4 notes · click to see its notes");
    expect(nodeHoverTip({ ...major, expanded: true })).toBe("A · 4 notes · click to close");
    expect(nodeHoverTip(minor)).toBe("a1 · 1 note under A · click to see its notes");
    expect(nodeHoverTip(leaf)).toBe("Note 1");
    expect(nodeHoverTip(major).toLowerCase()).not.toContain("double-click");
    expect(nodeHoverTip(minor).toLowerCase()).not.toContain("double-click");
  });

  it("frames an opened hub in the middle of the canvas", () => {
    expect(focusViewOnNode({ x: 100, y: 50 }, 400, 300, 1)).toEqual({ k: 1, x: 100, y: 100 });
    expect(focusViewOnNode({}, 400, 300)).toBeNull();
  });

  it("starts Show All at a local zoom so a bigger layout is not fitted away", () => {
    expect(initialForceView("showAll", 1100, 720).k).toBe(0.16);
    expect(initialForceView("constellation", 1100, 720).k).toBe(0.62);
  });

  it("fits a bbox into the canvas with padding", () => {
    const view = fitViewToNodes([{ x: 0, y: 0 }, { x: 200, y: 100 }], 400, 300, 50);
    expect(view).toEqual({ k: 1.5, x: 50, y: 75 });
  });

  it("lets a huge Show All layout stay zoomed out instead of clamping back in", () => {
    const view = fitViewToNodes([{ x: 0, y: 0 }, { x: 10000, y: 8000 }], 400, 300, 50, 0.05);
    expect(view?.k).toBe(0.05);
  });

  it("includes each node's radius in the fitted bounding box", () => {
    const view = fitViewToNodes(
      [{ x: 0, y: 0, r: 10 }, { x: 200, y: 100, r: 10 }],
      400,
      300,
      50,
    );
    const k = 300 / 220;
    expect(view).toEqual({ k, x: 200 - 100 * k, y: 150 - 50 * k });
  });

  it("keeps overlap links visible as the network edges", () => {
    expect(overlapLinkAlpha()).toBeGreaterThanOrEqual(0.12);
    expect(overlapLinkAlpha()).toBeLessThanOrEqual(0.35);
  });

  it("labels only important notes at the default Show All zoom", () => {
    expect(showAllLabelVisible({ ...leaf, important: true }, 0.16)).toBe(true);
    expect(showAllLabelVisible({ ...leaf, important: false, degree: 2 }, 0.16)).toBe(false);
    expect(showAllLabelVisible({ ...leaf, important: false, degree: 2 }, 0.95)).toBe(true);
  });

  it("keeps the same world centre when the stage grows for full screen", () => {
    const next = applyForceStageResize({ width: 800, height: 720, k: 0.16, x: 40, y: 30 }, { width: 1400, height: 900 });
    expect(next.k).toBe(0.16);
    expect(next.x).toBeCloseTo(1400 / 2 - (800 / 2 - 40));
    expect(next.y).toBeCloseTo(900 / 2 - (720 / 2 - 30));
  });

  it("keeps zoomed-out Show All notes larger than a pixel", () => {
    expect(canvasRadius(5, 0.16, 2.4)).toBeCloseTo(2.4 / 0.16);
    expect(canvasRadius(18, 1.2, 2.4)).toBe(18);
  });
});

describe("show all draw budget", () => {
  it("includes leaves so note clouds can settle organically", () => {
    expect(simulationNodes("showAll", nodes)).toEqual(nodes);
    expect(simulationNodes("constellation", nodes)).toEqual(nodes);
  });

  it("lets tag-sharing overlaps pull harder and closer than hub spokes", () => {
    expect(showAllLinkStrength("overlap")).toBeGreaterThan(showAllLinkStrength("spoke"));
    expect(showAllLinkDistance("overlap")).toBeLessThan(showAllLinkDistance("spoke"));
    expect(showAllLinkStrength("overlap")).toBeGreaterThanOrEqual(0.3);
  });

  it("lets busier hubs hold wider note clouds", () => {
    const busy = { ...major, count: 100 };
    const quiet = { ...major, count: 4 };
    const busySpoke: GraphLinkDatum = { source: busy, target: leaf, kind: "spoke", weight: 1, color: busy.color };
    const quietSpoke: GraphLinkDatum = { source: quiet, target: leaf, kind: "spoke", weight: 1, color: quiet.color };
    expect(showAllLinkDistance(busySpoke)).toBeGreaterThan(showAllLinkDistance(quietSpoke));
  });

  it("gives hubs more collision clearance than notes", () => {
    expect(showAllCollisionRadius(major)).toBeGreaterThan(showAllCollisionRadius(leaf));
    expect(showAllCollisionRadius(minor)).toBeGreaterThan(showAllCollisionRadius(leaf));
  });

  it("locks the settled map at a bounded tick budget", () => {
    expect(shouldLockShowAll(SHOW_ALL_SETTLE_TICKS - 1)).toBe(false);
    expect(shouldLockShowAll(SHOW_ALL_SETTLE_TICKS)).toBe(true);
  });

  it("draws every Show All strand at the same solid rounded width", () => {
    expect(showAllStrandWidth()).toBe(SHOW_ALL_STRAND_WIDTH);
    expect(showAllStrandDash()).toEqual([]);
    expect(showAllStrandStroke(false)).toEqual({
      dash: [],
      lineCap: "round",
      lineJoin: "round",
      width: SHOW_ALL_STRAND_WIDTH,
    });
    expect(showAllStrandStroke(true).width).toBe(SHOW_ALL_STRAND_WIDTH + 0.6);
    expect(showAllStrandStroke(true).dash).toEqual([]);
    const ctx = {
      lineCap: "butt" as CanvasLineCap,
      lineJoin: "miter" as CanvasLineJoin,
      lineWidth: 1,
      dash: [4, 5] as number[],
      setLineDash(next: number[]) {
        this.dash = [...next];
      },
    };
    applyShowAllStrandStroke(ctx, { viewK: 0.16 });
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.dash).toEqual([]);
    expect(ctx.lineWidth).toBeCloseTo(SHOW_ALL_STRAND_WIDTH / 0.16);
  });

  it("scales strand width only from the Width slider, never from overlap weight", () => {
    applyShowAllTuning({ lineWidthScale: 1.5 });
    expect(showAllStrandWidth()).toBe(3);
    resetShowAllTuning();
    expect(showAllStrandWidth()).toBe(SHOW_ALL_STRAND_WIDTH);
  });

  it("draws overlap edges at any zoom and keeps spokes at the default Show All zoom", () => {
    expect(showAllLinkShouldDraw("spoke", 0.09, true)).toBe(false);
    expect(showAllLinkShouldDraw("spoke", 0.16, true)).toBe(true);
    expect(showAllLinkShouldDraw("spoke", 0.16, false)).toBe(false);
    expect(showAllLinkShouldDraw("overlap", 0.02, true)).toBe(true);
    expect(showAllLinkShouldDraw("backbone", 0.01, false)).toBe(true);
  });

  it("always draws a selected or search-hot spoke even when zoomed out or off-screen", () => {
    expect(showAllLinkShouldDraw("spoke", 0.09, false, true)).toBe(true);
    expect(showAllLinkShouldDraw("spoke", 0.16, false, true)).toBe(true);
  });
});

describe("show all tuning sliders", () => {
  afterEach(() => {
    resetShowAllTuning();
  });

  it("starts from the spec defaults and exposes four live controls", () => {
    expect(showAllTuning).toEqual(SHOW_ALL_TUNING_DEFAULTS);
    expect(SHOW_ALL_TUNING_CONTROLS.map(item => item.key)).toEqual([
      "leafCharge",
      "overlapLinkStrength",
      "overlapLinkAlpha",
      "lineWidthScale",
    ]);
  });

  it("reads charge, pull, and opacity from the live tuning object", () => {
    applyShowAllTuning({ leafCharge: -240, overlapLinkStrength: 0.5, overlapLinkAlpha: 0.7 });
    expect(showAllNodeCharge(leaf)).toBe(-240);
    expect(showAllLinkStrength("overlap")).toBe(0.5);
    expect(overlapLinkAlpha()).toBe(0.7);
    expect(showAllNodeCharge(major)).toBe(-900);
  });

  it("restarts the simulation only for repulsion and pull", () => {
    expect(showAllTuningRestarts({ leafCharge: -200 })).toBe(true);
    expect(showAllTuningRestarts({ overlapLinkStrength: 0.4 })).toBe(true);
    expect(showAllTuningRestarts({ overlapLinkAlpha: 0.8 })).toBe(false);
    expect(showAllTuningRestarts({ lineWidthScale: 2 })).toBe(false);
  });

  it("maps repulsion through a positive slider without leaving the safe range", () => {
    const repulsion = SHOW_ALL_TUNING_CONTROLS[0]!;
    expect(sliderValueForTuning(repulsion)).toBe(140);
    expect(tuningFromSlider(repulsion, 300)).toBe(-300);
    applyShowAllTuning({ leafCharge: -999, overlapLinkAlpha: 4, lineWidthScale: 0 });
    expect(showAllTuning.leafCharge).toBe(-400);
    expect(showAllTuning.overlapLinkAlpha).toBe(1);
    expect(showAllTuning.lineWidthScale).toBe(0.25);
  });
});
