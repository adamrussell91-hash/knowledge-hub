import { isFocusLink, isFocusNode, isSearchHot, selectionCluster } from "./graphFocus";
import type { ArchiveGraphModel, GraphLinkDatum, GraphLinkKind, GraphNodeDatum } from "./keywordGraph";
import { showAllClusterRadius } from "./showAllGraph";

export type ForceGraphVariant = "constellation" | "showAll";

export const OVERLAP_LINK_ALPHA = 0.45;
export const SHOW_ALL_SPOKE_ALPHA = 0.15;
export const SHOW_ALL_SETTLE_TICKS = 180;

export type GraphNotePayload = { pageId: string; title: string; excerpt: string };

export type GraphClickResult =
  | { kind: "focusMajor"; label: string }
  | { kind: "expandMinor"; label: string }
  | { kind: "selectHub"; selected: string | null }
  | { kind: "selectNote"; selected: string; note: GraphNotePayload }
  | { kind: "ignore" };

export type DrawEmphasis = { hot: boolean; dim: boolean };
export type LinkEmphasis = { active: boolean; dim: boolean };
export type ViewState = { x: number; y: number; k: number };

export function canvasRadius(worldR: number, k: number, minPx: number) {
  return Math.max(worldR, minPx / Math.max(k, 0.001));
}

export type GraphMount = (() => void) & {
  setSearch: (query: string) => void;
  setModel: (model: ArchiveGraphModel) => void;
};

export function attachGraphSearch(
  teardown: () => void,
  setSearch: (query: string) => void,
  setModel: (model: ArchiveGraphModel) => void = () => {},
): GraphMount {
  const stop = teardown as GraphMount;
  stop.setSearch = setSearch;
  stop.setModel = setModel;
  return stop;
}

export function simulationNodes(variant: ForceGraphVariant, nodes: GraphNodeDatum[]) {
  return nodes;
}

export function showAllLinkDistance(linkOrKind: GraphLinkKind | GraphLinkDatum) {
  const kind = typeof linkOrKind === "string" ? linkOrKind : linkOrKind.kind;
  if (kind === "spoke" && typeof linkOrKind !== "string") {
    const source = typeof linkOrKind.source === "string" ? null : linkOrKind.source;
    const target = typeof linkOrKind.target === "string" ? null : linkOrKind.target;
    const hub = source?.kind === "major" ? source : target?.kind === "major" ? target : null;
    if (hub) return showAllClusterRadius(hub.count) * 0.5;
  }
  if (kind === "spoke") return 220;
  if (kind === "overlap") return 64;
  if (kind === "orbit") return 200;
  return 700;
}

export function showAllLinkStrength(kind: GraphLinkKind) {
  if (kind === "spoke") return 0.02;
  if (kind === "overlap") return 0.35;
  if (kind === "orbit") return 0.02;
  return 0.01;
}

export function showAllNodeCharge(node: GraphNodeDatum) {
  if (node.kind === "major") return -900;
  if (node.kind === "minor") return -300;
  return -140;
}

export function showAllCollisionRadius(node: GraphNodeDatum) {
  if (node.kind === "major") return Math.max(22, node.r + 12);
  if (node.kind === "minor") return Math.max(18, node.r + 10);
  return Math.max(14, node.r + 8);
}

export function showAllTargetStrength(node: GraphNodeDatum) {
  if (node.kind === "major") return 0.018;
  if (node.kind === "minor") return 0.02;
  return 0.012;
}

export function shouldLockShowAll(tickCount: number) {
  return tickCount >= SHOW_ALL_SETTLE_TICKS;
}

export function showAllLinkShouldDraw(kind: GraphLinkKind, viewK: number, leafOnScreen: boolean) {
  if (kind === "spoke") return viewK >= 0.18 && leafOnScreen;
  if (kind === "overlap") return true;
  return true;
}

export function isGraphSearching(query: string) {
  return query.trim().length > 0;
}

export function resolveNodeClick(
  variant: ForceGraphVariant,
  node: GraphNodeDatum,
  selected: string | null,
  excerptFor: (pageId: string) => string,
): GraphClickResult {
  if (node.kind === "major" || node.kind === "minor") {
    if (variant === "constellation") {
      return node.kind === "major"
        ? { kind: "focusMajor", label: node.label }
        : { kind: "expandMinor", label: node.label };
    }
    return { kind: "selectHub", selected: selected === node.label ? null : node.label };
  }
  if (node.pageId) {
    return {
      kind: "selectNote",
      selected: node.label,
      note: { pageId: node.pageId, title: node.label, excerpt: excerptFor(node.pageId) },
    };
  }
  return { kind: "ignore" };
}

export function resolveBackgroundClick(panDistance: number) {
  return panDistance < 4 ? "clear" : "ignore";
}

export function resolveEnterKey(
  selected: string | null,
  nodes: GraphNodeDatum[],
  excerptFor: (pageId: string) => string,
): GraphNotePayload | null {
  if (!selected) return null;
  const leaf = nodes.find(item => item.kind === "leaf" && item.label === selected && item.pageId);
  if (!leaf?.pageId) return null;
  return { pageId: leaf.pageId, title: leaf.label, excerpt: excerptFor(leaf.pageId) };
}

export function nodeHoverTip(node: GraphNodeDatum) {
  if (node.kind === "major") return `${node.label} · ${node.count} notes · click to focus`;
  if (node.kind === "minor") return `${node.label} · sub-theme of ${node.parentKeyword} · click to focus`;
  return node.label;
}

type DrawArgs = {
  query: string;
  nodes: GraphNodeDatum[];
  selected: string | null;
  hover: GraphNodeDatum | null;
};

export function nodeDrawState(node: GraphNodeDatum, args: DrawArgs): DrawEmphasis {
  if (isGraphSearching(args.query)) {
    const hot = isSearchHot(node, args.query, args.nodes);
    return { hot, dim: !hot };
  }
  const cluster = selectionCluster(args.nodes, args.selected);
  const focusing = Boolean(args.selected);
  const inFocus = isFocusNode(node, cluster);
  return {
    hot: args.hover === node || (focusing && inFocus),
    dim: focusing && !inFocus,
  };
}

export function linkDrawState(
  link: GraphLinkDatum,
  source: GraphNodeDatum,
  target: GraphNodeDatum,
  args: DrawArgs,
): LinkEmphasis {
  if (isGraphSearching(args.query)) {
    const active = isSearchHot(source, args.query, args.nodes) && isSearchHot(target, args.query, args.nodes);
    return { active, dim: !active };
  }
  const cluster = selectionCluster(args.nodes, args.selected);
  const focusing = Boolean(args.selected);
  const selectedActive = isFocusLink(link, args.nodes, cluster);
  const hoverActive = args.hover != null && (source.id === args.hover.id || target.id === args.hover.id);
  const active = selectedActive || hoverActive;
  return { active, dim: focusing && !active };
}

export function initialForceView(
  variant: ForceGraphVariant,
  width: number,
  height: number,
  anchor = { x: 760, y: 560 },
): ViewState {
  const k = variant === "showAll" ? 0.16 : 0.62;
  return {
    k,
    x: width / 2 - anchor.x * k,
    y: height / 2 - anchor.y * k,
  };
}

export function fitViewToNodes(
  nodes: Array<{ x?: number; y?: number; r?: number }>,
  width: number,
  height: number,
  padding = 56,
  minK = 0.28,
): ViewState | null {
  const placed = nodes.filter((item): item is { x: number; y: number; r?: number } => item.x != null && item.y != null);
  if (!placed.length) return null;
  const minX = Math.min(...placed.map(item => item.x - (item.r ?? 0)));
  const maxX = Math.max(...placed.map(item => item.x + (item.r ?? 0)));
  const minY = Math.min(...placed.map(item => item.y - (item.r ?? 0)));
  const maxY = Math.max(...placed.map(item => item.y + (item.r ?? 0)));
  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);
  const k = Math.min((width - padding * 2) / boxW, (height - padding * 2) / boxH);
  const clamped = Math.min(2.4, Math.max(minK, k));
  return {
    k: clamped,
    x: width / 2 - ((minX + maxX) / 2) * clamped,
    y: height / 2 - ((minY + maxY) / 2) * clamped,
  };
}
