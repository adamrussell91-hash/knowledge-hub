import { isFocusLink, isFocusNode, isSearchHot, selectionCluster } from "./graphFocus";
import type { ArchiveGraphModel, GraphLinkDatum, GraphLinkKind, GraphNodeDatum } from "./keywordGraph";
import { showAllClusterRadius } from "./showAllGraph";

export type ForceGraphVariant = "constellation" | "showAll";

export type ShowAllTuning = {
  leafCharge: number;
  overlapLinkStrength: number;
  overlapLinkAlpha: number;
  lineWidthScale: number;
};

export const SHOW_ALL_TUNING_DEFAULTS: ShowAllTuning = {
  leafCharge: -180,
  overlapLinkStrength: 0.28,
  overlapLinkAlpha: 0.14,
  lineWidthScale: 1,
};

export const showAllTuning: ShowAllTuning = { ...SHOW_ALL_TUNING_DEFAULTS };

export type ShowAllTuningControl = {
  key: keyof ShowAllTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  restarts: boolean;
  toSlider?: (value: number) => number;
  fromSlider?: (value: number) => number;
  format: (value: number) => string;
};

export const SHOW_ALL_TUNING_CONTROLS: readonly ShowAllTuningControl[] = [
  {
    key: "leafCharge",
    label: "Repulsion",
    min: 20,
    max: 400,
    step: 10,
    restarts: true,
    toSlider: value => Math.abs(value),
    fromSlider: value => -value,
    format: value => String(Math.round(Math.abs(value))),
  },
  {
    key: "overlapLinkStrength",
    label: "Pull",
    min: 0.02,
    max: 0.8,
    step: 0.01,
    restarts: true,
    format: value => value.toFixed(2),
  },
  {
    key: "overlapLinkAlpha",
    label: "Opacity",
    min: 0.05,
    max: 1,
    step: 0.01,
    restarts: false,
    format: value => value.toFixed(2),
  },
  {
    key: "lineWidthScale",
    label: "Width",
    min: 0.25,
    max: 3,
    step: 0.05,
    restarts: false,
    format: value => value.toFixed(2),
  },
];

export const SHOW_ALL_SPOKE_ALPHA = 0.28;
export const SHOW_ALL_SETTLE_TICKS = 240;
export const SHOW_ALL_RETUNE_MS = 90;
/** CSS-pixel width. Thick enough that diagonals do not hairline into dots. */
export const SHOW_ALL_STRAND_WIDTH = 2;
const SHOW_ALL_STRAND_ACTIVE_BOOST = 0.6;

export type ShowAllStrandStroke = {
  dash: number[];
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  width: number;
};

export function showAllStrandWidth(active = false) {
  const base = SHOW_ALL_STRAND_WIDTH * showAllTuning.lineWidthScale;
  return active ? base + SHOW_ALL_STRAND_ACTIVE_BOOST : base;
}

/** Show All strands stay solid. Dashes read as dotted hairlines at the default zoom. */
export function showAllStrandDash(): number[] {
  return [];
}

export function showAllStrandStroke(active = false): ShowAllStrandStroke {
  return {
    dash: showAllStrandDash(),
    lineCap: "round",
    lineJoin: "round",
    width: showAllStrandWidth(active),
  };
}

export function applyShowAllStrandStroke(
  ctx: Pick<CanvasRenderingContext2D, "lineCap" | "lineJoin" | "lineWidth" | "setLineDash">,
  args: { active?: boolean; viewK: number },
) {
  const stroke = showAllStrandStroke(Boolean(args.active));
  ctx.lineCap = stroke.lineCap;
  ctx.lineJoin = stroke.lineJoin;
  ctx.setLineDash(stroke.dash);
  ctx.lineWidth = stroke.width / Math.max(args.viewK, 0.001);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resetShowAllTuning() {
  Object.assign(showAllTuning, SHOW_ALL_TUNING_DEFAULTS);
  return showAllTuning;
}

export function applyShowAllTuning(partial: Partial<ShowAllTuning>) {
  if (partial.leafCharge != null) showAllTuning.leafCharge = clamp(partial.leafCharge, -400, -20);
  if (partial.overlapLinkStrength != null) {
    showAllTuning.overlapLinkStrength = clamp(partial.overlapLinkStrength, 0.02, 0.8);
  }
  if (partial.overlapLinkAlpha != null) showAllTuning.overlapLinkAlpha = clamp(partial.overlapLinkAlpha, 0.05, 1);
  if (partial.lineWidthScale != null) showAllTuning.lineWidthScale = clamp(partial.lineWidthScale, 0.25, 3);
  return showAllTuning;
}

export function showAllTuningRestarts(partial: Partial<ShowAllTuning>) {
  return partial.leafCharge != null || partial.overlapLinkStrength != null;
}

export function overlapLinkAlpha() {
  return showAllTuning.overlapLinkAlpha;
}

export function sliderValueForTuning(control: ShowAllTuningControl) {
  const value = showAllTuning[control.key];
  return control.toSlider ? control.toSlider(value) : value;
}

export function tuningFromSlider(control: ShowAllTuningControl, sliderValue: number) {
  return control.fromSlider ? control.fromSlider(sliderValue) : sliderValue;
}

export type GraphNotePayload = { pageId: string; title: string; excerpt: string };

export type GraphClickResult =
  | { kind: "expandHub"; label: string }
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
  setTuning: (partial: Partial<ShowAllTuning>) => void;
};

export function attachGraphSearch(
  teardown: () => void,
  setSearch: (query: string) => void,
  setModel: (model: ArchiveGraphModel) => void = () => {},
  setTuning: (partial: Partial<ShowAllTuning>) => void = () => {},
): GraphMount {
  const stop = teardown as GraphMount;
  stop.setSearch = setSearch;
  stop.setModel = setModel;
  stop.setTuning = setTuning;
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
  if (kind === "overlap" || kind === "backbone") {
    const weight = typeof linkOrKind === "string" ? 1 : linkOrKind.weight;
    return 58 + 70 / (1 + Math.max(weight, 0.05));
  }
  if (kind === "orbit") return 200;
  return 700;
}

export function showAllLinkStrength(kind: GraphLinkKind) {
  if (kind === "spoke") return 0.02;
  if (kind === "overlap" || kind === "backbone") return showAllTuning.overlapLinkStrength;
  if (kind === "orbit") return 0.02;
  return 0.01;
}

export function showAllNodeCharge(node: GraphNodeDatum) {
  if (node.kind === "major") return -900;
  if (node.kind === "minor") return -300;
  return showAllTuning.leafCharge;
}

export function showAllCollisionRadius(node: GraphNodeDatum) {
  if (node.kind === "major") return Math.max(22, node.r + 12);
  if (node.kind === "minor") return Math.max(18, node.r + 10);
  return Math.max(14, node.r + 8);
}

export function showAllTargetStrength(node: GraphNodeDatum) {
  if (node.kind === "major") return 0.018;
  if (node.kind === "minor") return 0.02;
  return 0.006;
}

export function shouldLockShowAll(tickCount: number) {
  return tickCount >= SHOW_ALL_SETTLE_TICKS;
}

export function showAllLinkShouldDraw(
  kind: GraphLinkKind,
  viewK: number,
  leafOnScreen: boolean,
  emphasized = false,
) {
  if (emphasized) return true;
  if (kind === "spoke") return viewK >= 0.1 && leafOnScreen;
  if (kind === "overlap" || kind === "backbone") return true;
  return true;
}

export function showAllLabelVisible(node: GraphNodeDatum, viewK: number, hover = false) {
  if (node.kind === "major") return true;
  if (hover) return viewK > 0.35;
  if (node.important && (node.degree ?? 0) >= 16) return viewK >= 0.28;
  if ((node.degree ?? 0) >= 14) return viewK >= 0.62;
  return viewK >= 1.1;
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
    if (variant === "constellation") return { kind: "expandHub", label: node.label };
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
  if (node.kind === "major" || node.kind === "minor") {
    const extra = node.kind === "minor" && node.parentKeyword ? ` under ${node.parentKeyword}` : "";
    const count = `${node.count} note${node.count === 1 ? "" : "s"}`;
    const action = node.expanded ? "click to close" : "click to see its notes";
    return `${node.label} · ${count}${extra} · ${action}`;
  }
  return node.label;
}

export function forceStageSize(
  host: { clientWidth: number; clientHeight: number },
  viewport: { innerHeight: number },
) {
  const width = host.clientWidth || 1100;
  const fallback = Math.max(720, Math.floor(viewport.innerHeight * 0.8));
  if (host.clientHeight > fallback) return { width, height: host.clientHeight };
  return { width, height: fallback };
}

export function applyForceStageResize(
  prev: ViewState & { width: number; height: number },
  nextSize: { width: number; height: number },
) {
  if (nextSize.width < 32 || nextSize.height < 32) return prev;
  if (nextSize.width === prev.width && nextSize.height === prev.height) return prev;
  const focusX = (prev.width / 2 - prev.x) / Math.max(prev.k, 1e-9);
  const focusY = (prev.height / 2 - prev.y) / Math.max(prev.k, 1e-9);
  return {
    width: nextSize.width,
    height: nextSize.height,
    k: prev.k,
    x: nextSize.width / 2 - focusX * prev.k,
    y: nextSize.height / 2 - focusY * prev.k,
  };
}

export function focusViewOnNode(
  node: { x?: number; y?: number },
  width: number,
  height: number,
  k = 0.92,
): ViewState | null {
  if (node.x == null || node.y == null) return null;
  return {
    k,
    x: width / 2 - node.x * k,
    y: height / 2 - node.y * k,
  };
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
    const sourceHot = isSearchHot(source, args.query, args.nodes);
    const targetHot = isSearchHot(target, args.query, args.nodes);
    const leafHot =
      (source.kind === "leaf" && sourceHot) || (target.kind === "leaf" && targetHot);
    const spokeFromHotHub = link.kind === "spoke" && (sourceHot || targetHot);
    const active = leafHot || spokeFromHotHub || (sourceHot && targetHot);
    return { active, dim: !active };
  }
  const cluster = selectionCluster(args.nodes, args.selected);
  const focusing = Boolean(args.selected);
  const selectedActive = isFocusLink(link, args.nodes, cluster, args.selected);
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
