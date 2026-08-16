import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

function nodeLabel(end: GraphLinkDatum["source"], nodes: GraphNodeDatum[]) {
  if (typeof end !== "string") return end.label;
  const node = nodes.find(item => item.id === end);
  return node?.label ?? end.replace(/^(major|minor|leaf):/, "");
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
      if (node.pageId && pageIds.has(node.pageId)) cluster.add(node.label);
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

export function isFocusLink(link: GraphLinkDatum, nodes: GraphNodeDatum[], cluster: Set<string>) {
  if (cluster.size === 0) return false;
  if (link.kind === "backbone") return false;
  const sourceLabel = nodeLabel(link.source, nodes);
  const targetLabel = nodeLabel(link.target, nodes);
  return cluster.has(sourceLabel) && cluster.has(targetLabel);
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
