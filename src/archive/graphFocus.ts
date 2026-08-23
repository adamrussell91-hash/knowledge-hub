import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

function resolveEnd(end: GraphLinkDatum["source"], nodes: GraphNodeDatum[]) {
  if (typeof end !== "string") return end;
  return nodes.find(item => item.id === end) ?? null;
}

function nodeLabel(end: GraphLinkDatum["source"], nodes: GraphNodeDatum[]) {
  const node = resolveEnd(end, nodes);
  if (node) return node.label;
  return typeof end === "string" ? end.replace(/^(major|minor|leaf):/, "") : end.label;
}

export function nodeMatchesQuery(node: GraphNodeDatum, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return node.label.toLowerCase().includes(needle);
}

export function searchCluster(nodes: GraphNodeDatum[], query: string) {
  const needle = query.trim().toLowerCase();
  const cluster = new Set<string>();
  if (!needle) return cluster;
  for (const node of nodes) {
    if (nodeMatchesQuery(node, needle)) cluster.add(node.id);
  }
  const pageIds = new Set(nodes.filter(node => cluster.has(node.id) && node.pageId).map(node => node.pageId!));
  for (const node of nodes) {
    if (node.pageId && pageIds.has(node.pageId)) cluster.add(node.id);
  }
  return cluster;
}

export function selectionCluster(nodes: GraphNodeDatum[], selected: string | null) {
  const cluster = new Set<string>();
  if (!selected) return cluster;

  const selectedNodes = nodes.filter(node => node.label === selected || node.id === selected);
  if (!selectedNodes.length) return cluster;

  const pageIds = new Set(selectedNodes.map(node => node.pageId).filter(Boolean) as string[]);
  if (pageIds.size) {
    for (const node of nodes) {
      if (node.pageId && pageIds.has(node.pageId)) {
        cluster.add(node.label);
        if (node.parentKeyword) cluster.add(node.parentKeyword);
        for (const hub of node.hubLabels ?? []) cluster.add(hub);
      }
    }
    return cluster;
  }

  const hub = selectedNodes.find(node => node.kind !== "leaf") ?? selectedNodes[0];
  cluster.add(hub.label);
  if (hub.kind === "major") {
    for (const node of nodes) {
      if (node.parentKeyword === hub.label) cluster.add(node.label);
    }
  }
  if (hub.kind === "minor" && hub.parentKeyword) {
    cluster.add(hub.parentKeyword);
    for (const node of nodes) {
      if (node.kind === "leaf" && node.parentKeyword === hub.label) cluster.add(node.label);
    }
  }
  return cluster;
}

export function isFocusLink(
  link: GraphLinkDatum,
  nodes: GraphNodeDatum[],
  cluster: Set<string>,
  selected: string | null = null,
) {
  if (cluster.size === 0) return false;
  if (link.kind === "backbone") return false;
  const sourceLabel = nodeLabel(link.source, nodes);
  const targetLabel = nodeLabel(link.target, nodes);
  if (cluster.has(sourceLabel) && cluster.has(targetLabel)) return true;

  if (!selected) return false;
  const selectedLeaves = nodes.filter(
    node => node.kind === "leaf" && (node.label === selected || node.id === selected),
  );
  if (!selectedLeaves.length) return false;
  const leafIds = new Set(selectedLeaves.map(node => node.id));
  const pageIds = new Set(selectedLeaves.map(node => node.pageId).filter(Boolean) as string[]);
  const touchesSelectedLeaf = (node: GraphNodeDatum | null) =>
    Boolean(node && (leafIds.has(node.id) || (node.pageId && pageIds.has(node.pageId))));
  return touchesSelectedLeaf(resolveEnd(link.source, nodes)) || touchesSelectedLeaf(resolveEnd(link.target, nodes));
}

export function isFocusNode(node: GraphNodeDatum, cluster: Set<string>) {
  if (cluster.size === 0) return true;
  return cluster.has(node.label) || cluster.has(node.id);
}

export function isSearchHot(node: GraphNodeDatum, query: string, nodes: GraphNodeDatum[]) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return searchCluster(nodes, query).has(node.id);
}
