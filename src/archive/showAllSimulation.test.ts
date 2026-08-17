import { describe, expect, it } from "vitest";
import type { GraphLinkDatum } from "./keywordGraph";
import { SHOW_ALL_CLUSTER_GAP, buildShowAllGraph, showAllClusterRadius } from "./showAllGraph";
import {
  SHOW_ALL_SETTLE_TICKS,
  createShowAllSimulation,
  lockShowAllNodes,
} from "./showAllSimulation";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: "" };
}

describe("Show All settling", () => {
  it("keeps dense, cross-linked clusters visibly separated and locks the result", () => {
    const labels = [
      "Educational Psychology",
      "Pedagogy & Instructional Design",
      "Wellbeing & Mental Health in Schools",
      "Cognitive Neuroscience",
    ];
    const pages = labels.flatMap((label, cluster) =>
      Array.from({ length: 36 }, (_, index) => page(`${cluster}-${index}`, `${label} ${index}`, [label])),
    );
    const model = buildShowAllGraph(pages);
    const leavesByCluster = new Map(
      labels.map(label => [label, model.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === label)]),
    );
    const bridges: GraphLinkDatum[] = [];
    for (let cluster = 0; cluster < labels.length; cluster++) {
      const left = leavesByCluster.get(labels[cluster]!)!;
      const right = leavesByCluster.get(labels[(cluster + 1) % labels.length]!)!;
      for (let index = 0; index < 24; index++) {
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
    simulation.tick(SHOW_ALL_SETTLE_TICKS);
    lockShowAllNodes(model.nodes);

    const clusters = labels.map(label => {
      const hub = model.nodes.find(node => node.kind === "major" && node.label === label)!;
      const leaves = leavesByCluster.get(label)!;
      const radius = Math.max(
        ...leaves.map(node => Math.hypot((node.x ?? 0) - (hub.x ?? 0), (node.y ?? 0) - (hub.y ?? 0))),
      );
      expect(radius).toBeGreaterThan(showAllClusterRadius(leaves.length) * 0.35);
      return { hub, radius };
    });

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const left = clusters[i]!;
        const right = clusters[j]!;
        const centreDistance = Math.hypot(
          (left.hub.x ?? 0) - (right.hub.x ?? 0),
          (left.hub.y ?? 0) - (right.hub.y ?? 0),
        );
        expect(centreDistance - left.radius - right.radius).toBeGreaterThan(SHOW_ALL_CLUSTER_GAP * 0.25);
      }
    }

    for (const node of model.nodes) {
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
  });
});
