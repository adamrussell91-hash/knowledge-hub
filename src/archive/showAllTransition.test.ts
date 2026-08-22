import { describe, expect, it } from "vitest";
import type { ArchiveGraphModel, GraphNodeDatum } from "./keywordGraph";
import {
  adoptShowAllNode,
  applyShowAllFade,
  fadeOpacity,
  mergeShowAllModels,
} from "./showAllTransition";

function node(partial: Partial<GraphNodeDatum> & Pick<GraphNodeDatum, "id" | "label">): GraphNodeDatum {
  return {
    kind: "leaf",
    count: 1,
    color: "#7eb0d5",
    soft: "rgba(126, 176, 213, 0.7)",
    ink: "#315875",
    r: 5,
    x: 10,
    y: 20,
    ...partial,
  };
}

const emptyModel = (nodes: GraphNodeDatum[]): ArchiveGraphModel => ({
  nodes,
  links: [],
  majorCount: 0,
  minorCount: 0,
  leaves: new Map(),
});

describe("show all view transitions", () => {
  it("keeps live coordinates when a note stays in the next view", () => {
    const prev = node({ id: "leaf:a", label: "A", x: 111, y: 222, vx: 3, vy: -1, color: "#111" });
    const next = node({ id: "leaf:a", label: "A", x: 900, y: 800, color: "#222", homeX: 400, homeY: 500 });
    const adopted = adoptShowAllNode(prev, next);
    expect(adopted).toBe(prev);
    expect(adopted.x).toBe(111);
    expect(adopted.y).toBe(222);
    expect(adopted.vx).toBe(3);
    expect(adopted.homeX).toBe(400);
    expect(adopted.color).toBe("#222");
    expect(adopted.fx).toBeNull();
  });

  it("fades arriving notes in and departing notes out without a jump", () => {
    expect(fadeOpacity(0, false)).toBe(0);
    expect(fadeOpacity(1, false)).toBe(1);
    expect(fadeOpacity(0, true)).toBe(1);
    expect(fadeOpacity(1, true)).toBe(0);
    expect(fadeOpacity(0.5, true)).toBeGreaterThan(0);
    expect(fadeOpacity(0.5, true)).toBeLessThan(1);
  });

  it("marks missing nodes as departing and keeps survivors in place", () => {
    const stay = node({ id: "leaf:stay", label: "Stay", x: 50, y: 60 });
    const leave = node({ id: "leaf:leave", label: "Leave", x: 70, y: 80 });
    const enter = node({ id: "leaf:enter", label: "Enter", x: 400, y: 500, homeX: 400, homeY: 500 });
    const merged = mergeShowAllModels([stay, leave], emptyModel([stay, enter]));
    expect(merged.nodes.find(item => item.id === "leaf:stay")?.x).toBe(50);
    expect(merged.nodes.find(item => item.id === "leaf:leave")?.departing).toBe(true);
    expect(merged.nodes.find(item => item.id === "leaf:enter")?.opacity).toBe(0);
    expect(merged.fading).toBe(true);
  });

  it("removes departed nodes once the fade finishes", () => {
    const leave = node({ id: "leaf:leave", label: "Leave", departing: true, opacity: 1 });
    const stay = node({ id: "leaf:stay", label: "Stay", opacity: 1 });
    const mid = applyShowAllFade([stay, leave], 0.4);
    expect(mid.nodes.map(item => item.id)).toEqual(["leaf:stay", "leaf:leave"]);
    expect(mid.fading).toBe(true);
    const done = applyShowAllFade([stay, leave], 1);
    expect(done.nodes.map(item => item.id)).toEqual(["leaf:stay"]);
    expect(done.fading).toBe(false);
  });
});
