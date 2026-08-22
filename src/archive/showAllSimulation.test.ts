import { describe, expect, it } from "vitest";
import type { GraphLinkDatum } from "./keywordGraph";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { buildShowAllGraph } from "./showAllGraph";
import {
  SHOW_ALL_SETTLE_TICKS,
  createShowAllSimulation,
  lockShowAllNodes,
} from "./showAllSimulation";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: "" };
}

describe("Show All settling", () => {
  it("leaves every node unpinned while simulating, then locks the settled mesh", () => {
    const labels = TOPIC_VOCABULARY.slice(0, 4);
    const pages = labels.flatMap((label, cluster) =>
      Array.from({ length: 24 }, (_, index) => page(`${cluster}-${index}`, `${label} ${index}`, [label])),
    );
    const model = buildShowAllGraph(pages);
    const leavesByCluster = new Map(
      labels.map(label => [label, model.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === label)]),
    );
    const bridges: GraphLinkDatum[] = [];
    for (let cluster = 0; cluster < labels.length; cluster++) {
      const left = leavesByCluster.get(labels[cluster]!)!;
      const right = leavesByCluster.get(labels[(cluster + 1) % labels.length]!)!;
      for (let index = 0; index < 8; index++) {
        bridges.push({
          source: left[index]!.id,
          target: right[(index * 5) % right.length]!.id,
          kind: "overlap",
          weight: 2,
          color: "rgba(160, 160, 160, 0.55)",
        });
      }
    }

    const simulation = createShowAllSimulation(model.nodes, [...model.links, ...bridges]).stop();
    for (const node of model.nodes) {
      expect(node.fx).toBeNull();
      expect(node.fy).toBeNull();
    }

    simulation.tick(SHOW_ALL_SETTLE_TICKS);
    lockShowAllNodes(model.nodes);

    const xs = model.nodes.map(node => node.x ?? 0);
    const ys = model.nodes.map(node => node.y ?? 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(400);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(400);

    const sameHub = leavesByCluster.get(labels[0]!)!;
    const otherHub = leavesByCluster.get(labels[2]!)!;
    const sameMean =
      sameHub.reduce((sum, node, index) => {
        const other = sameHub[(index + 1) % sameHub.length]!;
        return sum + Math.hypot((node.x ?? 0) - (other.x ?? 0), (node.y ?? 0) - (other.y ?? 0));
      }, 0) / sameHub.length;
    const crossMean =
      sameHub.reduce((sum, node, index) => {
        const other = otherHub[index % otherHub.length]!;
        return sum + Math.hypot((node.x ?? 0) - (other.x ?? 0), (node.y ?? 0) - (other.y ?? 0));
      }, 0) / sameHub.length;
    expect(sameMean).toBeLessThan(crossMean);

    for (const node of model.nodes) {
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
  });
});
