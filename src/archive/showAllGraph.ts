import type { PageManifestEntry } from "../domain/page";
import {
  buildArchiveGraph,
  topicKeywords,
  type ArchiveGraphModel,
  type GraphLinkDatum,
  type GraphNodeDatum,
} from "./keywordGraph";

const OVERLAP_MIN_SHARED = 2;
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
  });
  const majorByLabel = new Map(majors.map(node => [node.label, node]));
  const minors = nodes.filter(node => node.kind === "minor");
  const minorsByOwner = new Map<string, GraphNodeDatum[]>();
  for (const minor of minors) {
    const key = minor.parentKeyword ?? "";
    const list = minorsByOwner.get(key) ?? [];
    list.push(minor);
    minorsByOwner.set(key, list);
  }
  for (const [owner, siblings] of minorsByOwner) {
    const parent = majorByLabel.get(owner);
    siblings.forEach((minor, index) => {
      const seed = organicSeed(minor.id, index, Math.max(siblings.length, 1), 0.58);
      minor.x = (parent?.x ?? LAYOUT_CENTRE.x) + seed.x;
      minor.y = (parent?.y ?? LAYOUT_CENTRE.y) + seed.y;
    });
  }
}

function overlapLinks(eligible: PageManifestEntry[]): GraphLinkDatum[] {
  const tagSets = eligible.map(entry => new Set(topicKeywords(entry.tags)));
  const freq = new Map<string, number>();
  const byTag = new Map<string, number[]>();
  tagSets.forEach((tags, index) => {
    for (const tag of tags) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
      const list = byTag.get(tag) ?? [];
      list.push(index);
      byTag.set(tag, list);
    }
  });

  const overlaps: GraphLinkDatum[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < eligible.length; i++) {
    const left = tagSets[i]!;
    if (left.size < OVERLAP_MIN_SHARED) continue;
    let rarest: string | null = null;
    let rareCount = Infinity;
    for (const tag of left) {
      const count = freq.get(tag) ?? 0;
      if (count < rareCount) {
        rarest = tag;
        rareCount = count;
      }
    }
    if (!rarest) continue;
    for (const j of byTag.get(rarest) ?? []) {
      if (j <= i) continue;
      const right = tagSets[j]!;
      if (right.size < OVERLAP_MIN_SHARED) continue;
      let shared = 0;
      for (const tag of left) {
        if (right.has(tag)) shared++;
      }
      if (shared < OVERLAP_MIN_SHARED) continue;
      const key = `${i}|${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      overlaps.push({
        source: `leaf:${eligible[i]!.id}`,
        target: `leaf:${eligible[j]!.id}`,
        kind: "overlap",
        weight: shared,
        color: "rgba(160, 160, 160, 0.55)",
      });
    }
  }
  overlaps.sort((a, b) => b.weight - a.weight);
  return overlaps.slice(0, OVERLAP_MAX_EDGES);
}

export function buildShowAllGraph(
  entries: PageManifestEntry[],
  base: ArchiveGraphModel = buildArchiveGraph(entries),
): ArchiveGraphModel {
  const hubNodes: GraphNodeDatum[] = base.nodes.map(node => ({
    ...node,
    r:
      node.kind === "major"
        ? Math.max(10, node.r * 0.45)
        : Math.max(7, node.r * 0.7),
  }));
  placeHubs(hubNodes);

  const hubByLabel = new Map(hubNodes.map(node => [node.label, node]));
  const nodes: GraphNodeDatum[] = [...hubNodes];
  const links: GraphLinkDatum[] = [...base.links];

  const eligible = entries.filter(entry => topicKeywords(entry.tags).length > 0);
  const byHub = new Map<string, { hub?: GraphNodeDatum; entries: PageManifestEntry[] }>();
  for (const entry of eligible) {
    const keywords = [...new Set(topicKeywords(entry.tags))];
    const primaryHub = hubByLabel.get(keywords[0]);
    const hubKey = primaryHub?.id ?? "none";
    const group = byHub.get(hubKey) ?? { hub: primaryHub, entries: [] };
    group.entries.push(entry);
    byHub.set(hubKey, group);
  }

  for (const group of byHub.values()) {
    group.entries.forEach((entry, index) => {
      const origin = group.hub ?? LAYOUT_CENTRE;
      const seed = organicSeed(entry.id, index, group.entries.length);
      nodes.push({
        id: `leaf:${entry.id}`,
        kind: "leaf",
        label: entry.title,
        count: 1,
        pageId: entry.id,
        parentKeyword: topicKeywords(entry.tags)[0],
        color: group.hub?.color ?? "#888888",
        soft: group.hub?.soft ?? "rgba(136, 136, 136, 0.7)",
        ink: group.hub?.ink ?? "#444444",
        r: 5,
        x: (origin.x ?? LAYOUT_CENTRE.x) + seed.x,
        y: (origin.y ?? LAYOUT_CENTRE.y) + seed.y,
      });
      if (group.hub) {
        links.push({
          source: `leaf:${entry.id}`,
          target: group.hub.id,
          kind: "spoke",
          weight: 1,
          color: group.hub.color,
        });
      }
    });
  }

  links.push(...overlapLinks(eligible));

  return {
    nodes,
    links,
    majorCount: base.majorCount,
    minorCount: base.minorCount,
    leaves: base.leaves,
  };
}
