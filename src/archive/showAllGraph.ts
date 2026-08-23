import type { PageManifestEntry } from "../domain/page";
import {
  colorForHub,
  topicKeywords,
  type ArchiveGraphModel,
  type GraphLinkDatum,
  type GraphNodeDatum,
} from "./keywordGraph";
import {
  filterShowAllEntries,
  hubLabelsFor,
  type ShowAllGrouping,
} from "./showAllScope";

const OVERLAP_PER_NOTE = 3;
const OVERLAP_MAX_EDGES = 800;
const LAYOUT_CENTRE = { x: 760, y: 560 };
export const SHOW_ALL_CLUSTER_GAP = 320;
const CLUSTER_MIN_RADIUS = 380;
const CLUSTER_RADIUS_PER_ROOT_NOTE = 72;
const CLUSTER_MAX_RADIUS = 1300;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function showAllClusterRadius(noteCount: number) {
  return Math.min(
    CLUSTER_MAX_RADIUS,
    CLUSTER_MIN_RADIUS + Math.sqrt(Math.max(noteCount, 1)) * CLUSTER_RADIUS_PER_ROOT_NOTE,
  );
}

function hashUnit(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function organicSeed(id: string, index: number, count: number, radiusScale = 1) {
  const footprint = showAllClusterRadius(count) * radiusScale;
  const radius = Math.min(footprint * 0.84, 90 + Math.sqrt(index + 1) * 74);
  const angle = index * GOLDEN_ANGLE + hashUnit(id) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function hubRadius(count: number) {
  return Math.max(7, Math.min(18, 7 + Math.sqrt(Math.max(count, 1)) * 1.6));
}

function placeHubs(nodes: GraphNodeDatum[]) {
  const majors = nodes.filter(node => node.kind === "major");
  const maxFootprint = Math.max(...majors.map(node => showAllClusterRadius(node.count)), CLUSTER_MIN_RADIUS);
  const adjacentAngle = majors.length > 1 ? Math.sin(Math.PI / majors.length) : 1;
  const ringRadius =
    majors.length > 1
      ? (maxFootprint * 2 + SHOW_ALL_CLUSTER_GAP) / (2 * adjacentAngle) + 20
      : 0;
  majors.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(majors.length, 1) - Math.PI / 2;
    node.x = LAYOUT_CENTRE.x + Math.cos(angle) * ringRadius;
    node.y = LAYOUT_CENTRE.y + Math.sin(angle) * ringRadius;
    node.homeX = node.x;
    node.homeY = node.y;
  });
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function overlapScore(
  left: Set<string>,
  right: Set<string>,
  leftHub: string,
  rightHub: string,
) {
  let shared = 0;
  for (const tag of left) {
    if (right.has(tag)) shared += 1;
  }
  const union = left.size + right.size - shared || 1;
  const cross = leftHub && rightHub && leftHub !== rightHub ? 5 : 0;
  return shared * 10 + shared / union + cross;
}

/** Walk every topic in turn so the first popular tag cannot eat the edge budget. */
export function overlapVisitOrder(primaryHub: string[]) {
  const byHub = new Map<string, number[]>();
  primaryHub.forEach((hub, index) => {
    const list = byHub.get(hub) ?? [];
    list.push(index);
    byHub.set(hub, list);
  });
  const hubs = [...byHub.keys()];
  const order: number[] = [];
  let slot = 0;
  let remaining = primaryHub.length;
  while (remaining > 0) {
    for (const hub of hubs) {
      const index = byHub.get(hub)?.[slot];
      if (index === undefined) continue;
      order.push(index);
      remaining -= 1;
    }
    slot += 1;
  }
  return order;
}

function overlapLinks(
  eligible: PageManifestEntry[],
  primaryHub: string[],
): GraphLinkDatum[] {
  const tagSets = eligible.map(entry => new Set(topicKeywords(entry.tags)));
  const degree = new Map<string, number>();
  const seen = new Set<string>();
  const overlaps: GraphLinkDatum[] = [];
  const visit = overlapVisitOrder(primaryHub);

  const addEdge = (i: number, j: number, weight: number) => {
    const leftId = `leaf:${eligible[i]!.id}`;
    const rightId = `leaf:${eligible[j]!.id}`;
    const key = pairKey(leftId, rightId);
    if (seen.has(key)) return false;
    seen.add(key);
    degree.set(leftId, (degree.get(leftId) ?? 0) + 1);
    degree.set(rightId, (degree.get(rightId) ?? 0) + 1);
    overlaps.push({
      source: leftId,
      target: rightId,
      kind: "overlap",
      weight: Math.max(1, weight),
      color: "rgba(160, 160, 160, 0.7)",
    });
    return true;
  };

  const rankedFor = (i: number) => {
    const ranked: Array<{ j: number; score: number; shared: number }> = [];
    for (let j = 0; j < eligible.length; j++) {
      if (j === i) continue;
      let shared = 0;
      for (const tag of tagSets[i]!) {
        if (tagSets[j]!.has(tag)) shared += 1;
      }
      ranked.push({
        j,
        shared,
        score: overlapScore(tagSets[i]!, tagSets[j]!, primaryHub[i] ?? "", primaryHub[j] ?? ""),
      });
    }
    ranked.sort((a, b) => b.score - a.score || a.j - b.j);
    return ranked;
  };

  for (const i of visit) {
    const leftId = `leaf:${eligible[i]!.id}`;
    for (const candidate of rankedFor(i)) {
      if ((degree.get(leftId) ?? 0) >= OVERLAP_PER_NOTE) break;
      if (overlaps.length >= OVERLAP_MAX_EDGES) return overlaps;
      addEdge(i, candidate.j, candidate.shared);
    }
  }

  for (const i of visit) {
    const leftId = `leaf:${eligible[i]!.id}`;
    if ((degree.get(leftId) ?? 0) >= 2) continue;
    for (const candidate of rankedFor(i)) {
      if ((degree.get(leftId) ?? 0) >= 2) break;
      if (overlaps.length >= OVERLAP_MAX_EDGES) return overlaps;
      addEdge(i, candidate.j, candidate.shared);
    }
  }

  return overlaps;
}

function buildHubs(counts: Map<string, number>): GraphNodeDatum[] {
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ordered.map(([label, count]) => {
    const palette = colorForHub(label);
    return {
      id: `major:${label}`,
      kind: "major" as const,
      label,
      count,
      color: palette.fill,
      soft: palette.soft,
      ink: palette.ink,
      r: hubRadius(count),
    };
  });
}

export function buildShowAllGraph(
  entries: PageManifestEntry[],
  grouping: ShowAllGrouping = "tags",
): ArchiveGraphModel {
  const eligible = filterShowAllEntries(entries, grouping);
  const counts = new Map<string, number>();
  const labelsByEntry = eligible.map(entry => hubLabelsFor(entry, grouping));
  for (const labels of labelsByEntry) {
    for (const label of new Set(labels)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const hubNodes = buildHubs(counts);
  placeHubs(hubNodes);
  const hubByLabel = new Map(hubNodes.map(node => [node.label, node]));
  const nodes: GraphNodeDatum[] = [...hubNodes];
  const links: GraphLinkDatum[] = [];
  const primaryHub: string[] = [];

  const labelsById = new Map(eligible.map((entry, index) => [entry.id, labelsByEntry[index] ?? []]));
  const byHub = new Map<string, { hub?: GraphNodeDatum; entries: PageManifestEntry[] }>();
  eligible.forEach((entry, index) => {
    const labels = labelsByEntry[index] ?? [];
    const hub = hubByLabel.get(labels[0] ?? "");
    primaryHub[index] = hub?.label ?? labels[0] ?? "";
    const hubKey = hub?.id ?? "none";
    const group = byHub.get(hubKey) ?? { hub, entries: [] };
    group.entries.push(entry);
    byHub.set(hubKey, group);
  });

  for (const group of byHub.values()) {
    group.entries.forEach((entry, index) => {
      const origin = group.hub ?? LAYOUT_CENTRE;
      const seed = organicSeed(entry.id, index, group.entries.length);
      const x = (origin.x ?? LAYOUT_CENTRE.x) + seed.x;
      const y = (origin.y ?? LAYOUT_CENTRE.y) + seed.y;
      const hubLabels = [...new Set(labelsById.get(entry.id) ?? [])].filter(label => hubByLabel.has(label));
      nodes.push({
        id: `leaf:${entry.id}`,
        kind: "leaf",
        label: entry.title,
        count: 1,
        pageId: entry.id,
        parentKeyword: group.hub?.label,
        hubLabels,
        color: group.hub?.color ?? "#888888",
        soft: group.hub?.soft ?? "rgba(136, 136, 136, 0.7)",
        ink: group.hub?.ink ?? "#444444",
        r: 5,
        x,
        y,
        homeX: origin.x ?? LAYOUT_CENTRE.x,
        homeY: origin.y ?? LAYOUT_CENTRE.y,
      });
      for (const label of hubLabels) {
        const hub = hubByLabel.get(label);
        if (!hub) continue;
        links.push({
          source: `leaf:${entry.id}`,
          target: hub.id,
          kind: "spoke",
          weight: 1,
          color: hub.color,
        });
      }
    });
  }

  const overlaps = overlapLinks(eligible, primaryHub);
  for (const link of overlaps) {
    const source = typeof link.source === "string" ? nodes.find(node => node.id === link.source) : link.source;
    if (source) link.color = source.soft;
  }
  links.push(...overlaps);

  return {
    nodes,
    links,
    majorCount: hubNodes.length,
    minorCount: 0,
    leaves: new Map(),
  };
}
