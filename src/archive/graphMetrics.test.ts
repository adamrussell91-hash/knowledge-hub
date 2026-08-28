import { describe, expect, it } from "vitest";
import { formatGraphMetrics, graphMetrics } from "./graphMetrics";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

function node(id: string): GraphNodeDatum {
  return {
    id,
    kind: "leaf",
    label: id,
    count: 1,
    color: "#000",
    soft: "#000",
    ink: "#000",
    r: 4,
  };
}

function link(source: string, target: string): GraphLinkDatum {
  return { source, target, kind: "overlap", weight: 1, color: "#000" };
}

describe("graphMetrics", () => {
  it("reports an empty edge set as many orphans and components", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const metrics = graphMetrics(nodes, []);
    expect(metrics).toMatchObject({
      nodeCount: 3,
      edgeCount: 0,
      meanDegree: 0,
      medianDegree: 0,
      orphans: 3,
      components: 3,
      largestComponentPct: 100 / 3,
    });
  });

  it("reports a connected triangle as one component with no orphans", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const metrics = graphMetrics(nodes, [link("a", "b"), link("b", "c"), link("c", "a")]);
    expect(metrics.nodeCount).toBe(3);
    expect(metrics.edgeCount).toBe(3);
    expect(metrics.meanDegree).toBe(2);
    expect(metrics.medianDegree).toBe(2);
    expect(metrics.orphans).toBe(0);
    expect(metrics.components).toBe(1);
    expect(metrics.largestComponentPct).toBe(100);
    expect(formatGraphMetrics(metrics)).toContain("1 component");
  });
});
