import type { PageManifestEntry } from "../domain/page";
import {
  colorForHub,
  type ArchiveGraphModel,
  type GraphLinkDatum,
  type GraphNodeDatum,
} from "./keywordGraph";
import {
  filterShowAllEntries,
  hubLabelsFor,
  type ShowAllGrouping,
} from "./showAllScope";
import { buildShowAllNoteEdges } from "./showAllEdges";

const LAYOUT_CENTRE = { x: 760, y: 560 };
export const SHOW_ALL_CLUSTER_GAP = 72;
const CLUSTER_MIN_RADIUS = 110;
const CLUSTER_RADIUS_PER_ROOT_NOTE = 14;
const CLUSTER_MAX_RADIUS = 220;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function showAllClusterRadius(noteCount: number) {
  return Math.min(
    CLUSTER_MAX_RADIUS,
    CLUSTER_MIN_RADIUS + Math.sqrt(Math.max(noteCount, 1)) * CLUSTER_RADIUS_PER_ROOT_NOTE,
  );
}

export function showAllNoteRadius(degree: number) {
  return 3.2 + Math.sqrt(Math.max(degree, 0)) * 1.7;
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
  return Math.max(16, Math.min(28, 16 + Math.sqrt(Math.max(count, 1)) * 1.1));
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
    node.fx = node.x;
    node.fy = node.y;
  });
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

  const labelsById = new Map(eligible.map((entry, index) => [entry.id, labelsByEntry[index] ?? []]));
  const byHub = new Map<string, { hub?: GraphNodeDatum; entries: PageManifestEntry[] }>();
  eligible.forEach((entry, index) => {
    const labels = labelsByEntry[index] ?? [];
    const hub = hubByLabel.get(labels[0] ?? "");
    const hubKey = hub?.id ?? "none";
    const group = byHub.get(hubKey) ?? { hub, entries: [] };
    group.entries.push(entry);
    byHub.set(hubKey, group);
  });

  const built = buildShowAllNoteEdges(eligible, labelsByEntry);
  const degreeById = new Map(eligible.map((entry, index) => [`leaf:${entry.id}`, built.degree[index] ?? 0]));

  for (const group of byHub.values()) {
    group.entries.forEach((entry, index) => {
      const origin = group.hub ?? LAYOUT_CENTRE;
      const seed = organicSeed(entry.id, index, group.entries.length);
      const x = (origin.x ?? LAYOUT_CENTRE.x) + seed.x;
      const y = (origin.y ?? LAYOUT_CENTRE.y) + seed.y;
      const hubLabels = [...new Set(labelsById.get(entry.id) ?? [])].filter(label => hubByLabel.has(label));
      const degree = degreeById.get(`leaf:${entry.id}`) ?? 0;
      const palette = group.hub
        ? { fill: group.hub.color, soft: group.hub.soft, ink: group.hub.ink }
        : colorForHub(hubLabels[0] ?? entry.title);
      nodes.push({
        id: `leaf:${entry.id}`,
        kind: "leaf",
        label: entry.title,
        count: 1,
        pageId: entry.id,
        parentKeyword: group.hub?.label,
        hubLabels,
        degree,
        color: palette.fill,
        soft: palette.soft,
        ink: palette.ink,
        r: showAllNoteRadius(degree),
        x,
        y,
        homeX: origin.x ?? LAYOUT_CENTRE.x,
        homeY: origin.y ?? LAYOUT_CENTRE.y,
      });
      const home = group.hub;
      if (home) {
        links.push({
          source: `leaf:${entry.id}`,
          target: home.id,
          kind: "spoke",
          weight: 1,
          color: home.color,
        });
      }
    });
  }

  const overlaps = built.links;
  const leafById = new Map(nodes.filter(node => node.kind === "leaf").map(node => [node.id, node]));
  for (const link of overlaps) {
    const source = typeof link.source === "string" ? leafById.get(link.source) : link.source;
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
