/** Show All canvas LOD — keep the map connected without drawing every edge every frame. */

import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export const SHOW_ALL_SETTLE_TICKS = 90;
export const SHOW_ALL_SETTLE_DRAW_EVERY = 6;
export const SHOW_ALL_EDGE_BUDGET_FAR = 2200;
export const SHOW_ALL_EDGE_BUDGET_NEAR = 7000;
export const SHOW_ALL_LOD_NEAR = 0.55;
export const SHOW_ALL_RING_MIN_K = 0.32;

export function showAllEdgeBudget(k: number): number {
  return k >= SHOW_ALL_LOD_NEAR ? SHOW_ALL_EDGE_BUDGET_NEAR : SHOW_ALL_EDGE_BUDGET_FAR;
}

export function showAllLinkEndId(end: GraphLinkDatum["source"] | GraphLinkDatum["target"]): string {
  return typeof end === "string" ? end : end.id;
}

export function showAllLinkRank(link: GraphLinkDatum): number {
  return (link.kind === "backbone" ? 1_000_000 : 0) + (link.weight ?? 0);
}

export function rankShowAllLinks(links: GraphLinkDatum[]): GraphLinkDatum[] {
  return [...links].sort((a, b) => showAllLinkRank(b) - showAllLinkRank(a));
}

export function pickShowAllLinksToDraw(
  ranked: GraphLinkDatum[],
  k: number,
  opts: {
    keepExtra?: (link: GraphLinkDatum) => boolean;
    preferVisible?: (link: GraphLinkDatum) => boolean;
  } = {},
): GraphLinkDatum[] {
  const budget = showAllEdgeBudget(k);
  const pool =
    k >= SHOW_ALL_LOD_NEAR && opts.preferVisible
      ? ranked.filter(link => opts.preferVisible!(link))
      : ranked;
  const picked = pool.slice(0, budget);
  if (!opts.keepExtra) return picked;
  const seen = new Set(picked);
  for (const link of ranked) {
    if (seen.has(link)) continue;
    if (!opts.keepExtra(link)) continue;
    picked.push(link);
    seen.add(link);
  }
  return picked;
}

export function showAllLabelVisible(node: GraphNodeDatum, viewK: number, hover = false): boolean {
  if (node.kind === "leaf") return false;
  if (node.kind === "major") return true;
  if (hover) return viewK > 0.35;
  if ((node.degree ?? node.count ?? 0) >= 18) return viewK >= 0.28;
  if ((node.degree ?? node.count ?? 0) >= 8) return viewK >= 0.55;
  return viewK >= 1.05;
}

export function showAllDrawRings(k: number): boolean {
  return k >= SHOW_ALL_RING_MIN_K;
}
