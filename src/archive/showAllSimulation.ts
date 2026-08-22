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

const LAYOUT_CENTRE = { x: 760, y: 560 };

export function lockShowAllNodes(nodes: GraphNodeDatum[]) {
  for (const node of nodes) {
    if (node.departing) continue;
    node.fx = node.x ?? 0;
    node.fy = node.y ?? 0;
    node.vx = 0;
    node.vy = 0;
  }
}

export function unlockShowAllNodes(nodes: GraphNodeDatum[]) {
  for (const node of nodes) {
    if (node.departing) continue;
    node.fx = null;
    node.fy = null;
  }
}

function homeFor(node: GraphNodeDatum, hubs: Map<string, { x: number; y: number }>) {
  if (node.homeX != null && node.homeY != null) return { x: node.homeX, y: node.homeY };
  if (node.kind === "major") return { x: node.x ?? LAYOUT_CENTRE.x, y: node.y ?? LAYOUT_CENTRE.y };
  return hubs.get(node.parentKeyword ?? "") ?? LAYOUT_CENTRE;
}

export function createShowAllSimulation(
  nodes: GraphNodeDatum[],
  links: GraphLinkDatum[],
): Simulation<GraphNodeDatum, GraphLinkDatum> {
  const hubHomes = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (node.kind !== "major") continue;
    hubHomes.set(node.label, {
      x: node.homeX ?? node.x ?? LAYOUT_CENTRE.x,
      y: node.homeY ?? node.y ?? LAYOUT_CENTRE.y,
    });
  }

  unlockShowAllNodes(nodes);

  return forceSimulation<GraphNodeDatum>(nodes)
    .alpha(0.86)
    .alphaDecay(0.022)
    .velocityDecay(0.46)
    .force(
      "link",
      forceLink<GraphNodeDatum, GraphLinkDatum>(links)
        .id(node => node.id)
        .distance(showAllLinkDistance)
        .strength(link => showAllLinkStrength(link.kind)),
    )
    .force("charge", forceManyBody<GraphNodeDatum>().strength(showAllNodeCharge).distanceMax(2000))
    .force("x", forceX<GraphNodeDatum>(node => homeFor(node, hubHomes).x).strength(showAllTargetStrength))
    .force("y", forceY<GraphNodeDatum>(node => homeFor(node, hubHomes).y).strength(showAllTargetStrength))
    .force(
      "collide",
      forceCollide<GraphNodeDatum>().radius(showAllCollisionRadius).strength(0.82).iterations(2),
    );
}
