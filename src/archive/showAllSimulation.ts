import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import {
  SHOW_ALL_SETTLE_TICKS,
  showAllCollisionRadius,
  showAllLinkDistance,
  showAllLinkStrength,
  showAllNodeCharge,
  showAllTargetStrength,
} from "./forceGraphBehavior";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export { SHOW_ALL_SETTLE_TICKS };

export function lockShowAllNodes(nodes: GraphNodeDatum[]) {
  for (const node of nodes) {
    node.fx = node.x ?? 0;
    node.fy = node.y ?? 0;
  }
}

export function createShowAllSimulation(
  nodes: GraphNodeDatum[],
  links: GraphLinkDatum[],
): Simulation<GraphNodeDatum, GraphLinkDatum> {
  const majorTargets = new Map(
    nodes
      .filter(node => node.kind === "major")
      .map(node => [node.label, { x: node.x ?? 760, y: node.y ?? 560 }]),
  );

  for (const node of nodes) {
    if (node.kind === "major") {
      node.fx = node.x ?? 760;
      node.fy = node.y ?? 560;
    } else {
      node.fx = null;
      node.fy = null;
    }
  }

  const targetFor = (node: GraphNodeDatum) =>
    node.kind === "major"
      ? { x: node.x ?? 760, y: node.y ?? 560 }
      : majorTargets.get(node.parentKeyword ?? "") ?? { x: 760, y: 560 };

  return forceSimulation<GraphNodeDatum>(nodes)
    .alpha(0.9)
    .alphaDecay(0.035)
    .velocityDecay(0.42)
    .force(
      "link",
      forceLink<GraphNodeDatum, GraphLinkDatum>(links)
        .id(node => node.id)
        .distance(showAllLinkDistance)
        .strength(link => showAllLinkStrength(link.kind)),
    )
    .force("charge", forceManyBody<GraphNodeDatum>().strength(showAllNodeCharge).distanceMax(1800))
    .force("x", forceX<GraphNodeDatum>(node => targetFor(node).x).strength(showAllTargetStrength))
    .force("y", forceY<GraphNodeDatum>(node => targetFor(node).y).strength(showAllTargetStrength))
    .force(
      "collide",
      forceCollide<GraphNodeDatum>().radius(showAllCollisionRadius).strength(0.95).iterations(2),
    );
}
