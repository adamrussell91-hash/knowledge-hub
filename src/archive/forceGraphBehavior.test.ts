import { describe, expect, it } from "vitest";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import {
  OVERLAP_LINK_ALPHA,
  SHOW_ALL_SETTLE_TICKS,
  fitViewToNodes,
  initialForceView,
  isGraphSearching,
  linkDrawState,
  nodeDrawState,
  canvasRadius,
  nodeHoverTip,
  resolveBackgroundClick,
  resolveEnterKey,
  resolveNodeClick,
  showAllLinkShouldDraw,
  showAllCollisionRadius,
  showAllLinkDistance,
  showAllLinkStrength,
  shouldLockShowAll,
  simulationNodes,
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
      kind: "focusMajor",
      label: "A",
    });
    expect(resolveNodeClick("constellation", minor, null, excerptFor)).toEqual({
      kind: "expandMinor",
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

  it("greys links unless both ends are search-hot", () => {
    const spoke: GraphLinkDatum = {
      source: "minor:a1",
      target: "leaf:n1",
      kind: "spoke",
      weight: 1,
      color: "#7eb0d5",
    };
    expect(linkDrawState(spoke, minor, leaf, { query: "note", nodes, selected: null, hover: null })).toEqual({
      active: false,
      dim: true,
    });
    expect(linkDrawState(spoke, leaf, leaf, { query: "note", nodes, selected: null, hover: null })).toEqual({
      active: true,
      dim: false,
    });
  });
});

describe("force graph chrome", () => {
  it("never mentions double-click for the list in hover tips", () => {
    expect(nodeHoverTip(major)).toBe("A · 4 notes · click to focus");
    expect(nodeHoverTip(minor)).toBe("a1 · sub-theme of A · click to focus");
    expect(nodeHoverTip(leaf)).toBe("Note 1");
    expect(nodeHoverTip(major).toLowerCase()).not.toContain("double-click");
    expect(nodeHoverTip(minor).toLowerCase()).not.toContain("double-click");
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

  it("keeps overlap links visually subordinate", () => {
    expect(OVERLAP_LINK_ALPHA).toBeLessThanOrEqual(0.16);
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

  it("keeps local spokes stronger and shorter than cross-cluster overlaps", () => {
    expect(showAllLinkStrength("spoke")).toBeGreaterThan(showAllLinkStrength("overlap"));
    expect(showAllLinkDistance("spoke")).toBeLessThan(showAllLinkDistance("overlap"));
    expect(showAllLinkStrength("overlap")).toBeLessThanOrEqual(0.01);
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

  it("only draws a spoke when the leaf is on screen and zoomed in", () => {
    expect(showAllLinkShouldDraw("spoke", 0.11, true)).toBe(false);
    expect(showAllLinkShouldDraw("spoke", 0.12, false)).toBe(false);
    expect(showAllLinkShouldDraw("spoke", 0.12, true)).toBe(true);
    expect(showAllLinkShouldDraw("overlap", 0.08, true)).toBe(false);
    expect(showAllLinkShouldDraw("overlap", 0.09, true)).toBe(true);
    expect(showAllLinkShouldDraw("backbone", 0.01, false)).toBe(true);
  });
});
