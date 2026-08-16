import { evenPhase, placeOnCircularRings } from "./universeGraph";
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
export const SHOW_ALL_LAYOUT_SCALE = 10;
const HUB_INNER = 2200;
const HUB_GAP = 1600;

const LEAF_INNER = 280 * SHOW_ALL_LAYOUT_SCALE;
const LEAF_GAP = 220 * SHOW_ALL_LAYOUT_SCALE;
const LEAF_SPACING = 52;

export function concentricOrbits(count: number, inner: number, gap: number, spacing: number) {
  const out: { radius: number; phase: number }[] = [];
  if (count <= 0) return out;
  let remaining = count;
  let ring = 0;
  while (remaining > 0) {
    const radius = inner + ring * gap;
    const capacity = Math.max(8, Math.floor((Math.PI * 2 * radius) / spacing));
    const n = Math.min(remaining, capacity);
    const offset = ring % 2 === 0 ? 0 : Math.PI / n;
    for (let i = 0; i < n; i++) out.push({ radius, phase: evenPhase(i, n) + offset });
    remaining -= n;
    ring += 1;
  }
  return out;
}

function placeHubs(nodes: GraphNodeDatum[]) {
  const majors = nodes.filter(node => node.kind === "major");
  majors.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(majors.length, 1) - Math.PI / 2;
    const radius = HUB_INNER + index * HUB_GAP;
    node.x = LAYOUT_CENTRE.x + Math.cos(angle) * radius;
    node.y = LAYOUT_CENTRE.y + Math.sin(angle) * radius;
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
    const slots = placeOnCircularRings(siblings.length, 8, 420 * SHOW_ALL_LAYOUT_SCALE, 140 * SHOW_ALL_LAYOUT_SCALE);
    siblings.forEach((minor, index) => {
      const slot = slots[index] ?? { radius: 420 * SHOW_ALL_LAYOUT_SCALE, phase: evenPhase(index, siblings.length) };
      minor.x = (parent?.x ?? LAYOUT_CENTRE.x) + Math.cos(slot.phase) * slot.radius;
      minor.y = (parent?.y ?? LAYOUT_CENTRE.y) + Math.sin(slot.phase) * slot.radius;
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
    const slots = concentricOrbits(group.entries.length, LEAF_INNER, LEAF_GAP, LEAF_SPACING);
    group.entries.forEach((entry, index) => {
      const slot = slots[index] ?? { radius: LEAF_INNER, phase: evenPhase(index, group.entries.length) };
      const origin = group.hub ?? LAYOUT_CENTRE;
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
        x: (origin.x ?? LAYOUT_CENTRE.x) + Math.cos(slot.phase) * slot.radius,
        y: (origin.y ?? LAYOUT_CENTRE.y) + Math.sin(slot.phase) * slot.radius,
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
