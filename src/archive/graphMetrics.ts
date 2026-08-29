import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export type GraphMetrics = {
  nodeCount: number;
  edgeCount: number;
  meanDegree: number;
  medianDegree: number;
  orphans: number;
  components: number;
  largestComponentPct: number;
  degreeHistogram: Record<string, number>;
};

function endpointId(end: GraphLinkDatum["source"] | GraphLinkDatum["target"]) {
  return typeof end === "string" ? end : end.id;
}

export function noteToNoteLinks(links: GraphLinkDatum[]) {
  return links.filter(link => link.kind === "overlap" || link.kind === "backbone");
}

export function nodeDegrees(nodes: GraphNodeDatum[], links: GraphLinkDatum[]) {
  const degree = new Map<string, number>(nodes.map(node => [node.id, 0]));
  for (const link of links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (source === target) continue;
    if (degree.has(source)) degree.set(source, (degree.get(source) ?? 0) + 1);
    if (degree.has(target)) degree.set(target, (degree.get(target) ?? 0) + 1);
  }
  return degree;
}

function componentSizes(nodes: GraphNodeDatum[], links: GraphLinkDatum[]) {
  const parent = new Map<string, string>(nodes.map(node => [node.id, node.id]));
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next !== id) {
      const root = find(next);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const unite = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(left, right);
  };
  for (const link of links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (parent.has(source) && parent.has(target)) unite(source, target);
  }
  const sizes = new Map<string, number>();
  for (const node of nodes) {
    const root = find(node.id);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return [...sizes.values()].sort((a, b) => b - a);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function graphMetrics(nodes: GraphNodeDatum[], links: GraphLinkDatum[]): GraphMetrics {
  const degree = nodeDegrees(nodes, links);
  const degrees = nodes.map(node => degree.get(node.id) ?? 0);
  const orphans = degrees.filter(value => value === 0).length;
  const components = componentSizes(nodes, links);
  const histogram: Record<string, number> = {};
  for (const value of degrees) {
    const bucket = value >= 20 ? "20+" : String(value);
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  return {
    nodeCount: nodes.length,
    edgeCount: links.length,
    meanDegree: nodes.length ? (2 * links.length) / nodes.length : 0,
    medianDegree: median(degrees),
    orphans,
    components: components.length,
    largestComponentPct: nodes.length ? ((components[0] ?? 0) / nodes.length) * 100 : 100,
    degreeHistogram: histogram,
  };
}

export function formatGraphMetrics(metrics: GraphMetrics) {
  const largest = metrics.largestComponentPct.toFixed(1);
  return `${metrics.nodeCount} notes · ${metrics.edgeCount} edges · ${metrics.components} component${
    metrics.components === 1 ? "" : "s"
  } · ${largest}% in the giant`;
}
