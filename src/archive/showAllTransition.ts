import type { ArchiveGraphModel, GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export const SHOW_ALL_FADE_MS = 520;

export function easeOutCubic(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 3;
}

export function fadeOpacity(progress: number, departing: boolean) {
  const eased = easeOutCubic(progress);
  return departing ? 1 - eased : eased;
}

export function adoptShowAllNode(prev: GraphNodeDatum | undefined, next: GraphNodeDatum): GraphNodeDatum {
  if (!prev) {
    return {
      ...next,
      opacity: 0,
      departing: false,
      fx: null,
      fy: null,
      vx: 0,
      vy: 0,
    };
  }
  prev.label = next.label;
  prev.kind = next.kind;
  prev.count = next.count;
  prev.pageId = next.pageId;
  prev.parentKeyword = next.parentKeyword;
  prev.hubLabels = next.hubLabels;
  prev.degree = next.degree;
  prev.community = next.community;
  prev.communityLabel = next.communityLabel;
  prev.important = next.important;
  prev.color = next.color;
  prev.soft = next.soft;
  prev.ink = next.ink;
  prev.r = next.r;
  prev.homeX = next.homeX;
  prev.homeY = next.homeY;
  prev.departing = false;
  prev.fx = null;
  prev.fy = null;
  prev.opacity = prev.opacity ?? 1;
  return prev;
}

export function departingShowAllNode(node: GraphNodeDatum): GraphNodeDatum {
  node.departing = true;
  node.fx = node.x ?? node.homeX ?? 0;
  node.fy = node.y ?? node.homeY ?? 0;
  node.vx = 0;
  node.vy = 0;
  node.opacity = node.opacity ?? 1;
  return node;
}

export function mergeShowAllModels(current: GraphNodeDatum[], next: ArchiveGraphModel) {
  const prevById = new Map(current.map(node => [node.id, node]));
  const kept = next.nodes.map(node => adoptShowAllNode(prevById.get(node.id), node));
  const nextIds = new Set(next.nodes.map(node => node.id));
  const departing = current
    .filter(node => !nextIds.has(node.id) && !node.departing)
    .map(departingShowAllNode);
  return {
    nodes: [...kept, ...departing],
    links: next.links.map(link => ({ ...link } satisfies GraphLinkDatum)),
    fading: departing.length > 0 || kept.some(node => (node.opacity ?? 1) < 1),
  };
}

export function applyShowAllFade(nodes: GraphNodeDatum[], progress: number) {
  const next: GraphNodeDatum[] = [];
  let fading = false;
  for (const node of nodes) {
    if (node.departing) {
      node.opacity = fadeOpacity(progress, true);
      if ((node.opacity ?? 0) <= 0.02) continue;
      fading = true;
      next.push(node);
      continue;
    }
    if ((node.opacity ?? 1) < 1) {
      node.opacity = fadeOpacity(progress, false);
      fading = (node.opacity ?? 1) < 1;
      next.push(node);
      continue;
    }
    next.push(node);
  }
  return { nodes: next, fading };
}
