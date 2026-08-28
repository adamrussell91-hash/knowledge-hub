import type { PageManifestEntry } from "../domain/page";
import { TOPIC_VOCABULARY, canonicalTopicTag } from "../tidy/vocabulary";

const SKIP = new Set(["note", "lecture", "assessment", "tutorial", "study note", "seminar", "test"]);

/** Closed-list topics are first-class hubs. Leftovers (if any) nest as minors. */
const MAJOR_COUNT = TOPIC_VOCABULARY.length;
const BACKBONE_MIN_WEIGHT = 3;
const BACKBONE_MAX_EDGES = 22;
/** Notes shown around every hub on first paint — the actual constellation. */
export const CONSTELLATION_PREVIEW = 4;
/** Notes shown after opening a hub. */
export const CONSTELLATION_EXPAND = 16;
const LEAF_SAMPLE = CONSTELLATION_EXPAND;

function swatch(fill: string, ink: string) {
  const n = Number.parseInt(fill.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { fill, soft: `rgba(${r}, ${g}, ${b}, 0.7)`, ink } as const;
}

/**
 * One swatch per closed topic. Hues are kit-anchored (Wave, High Sea, Success,
 * Danger, pastel inks) and interleaved so neighbouring vocabulary items do not
 * land in the same family — the old list repeated blue/sage/gold until the
 * map read as two dusty piles.
 */
export const KEYWORD_PALETTE = [
  swatch("#5b8ec8", "#294c71"),
  swatch("#f68620", "#a85a0c"),
  swatch("#4a9a68", "#2f7a4f"),
  swatch("#9b7eb8", "#5d4e70"),
  swatch("#d4b44a", "#6c581f"),
  swatch("#c45c5c", "#9b2c2c"),
  swatch("#3d9aa6", "#2f5c57"),
  swatch("#d4896a", "#7a5038"),
  swatch("#376fb7", "#17375e"),
  swatch("#d46a8a", "#6e3d48"),
  swatch("#7eb0d5", "#315875"),
  swatch("#7aaa5a", "#3c5949"),
  swatch("#8f7eb0", "#5d4d72"),
  swatch("#e07818", "#a85a0c"),
  swatch("#5a7a9a", "#244f7c"),
  swatch("#c98b78", "#77503a"),
  swatch("#6fb0a8", "#2f5c57"),
  swatch("#b55a7a", "#6e4454"),
  swatch("#c9a35c", "#6c581f"),
  swatch("#9b2c2c", "#6e3d48"),
] as const;

export function isTopicKeyword(tag: string) {
  return !SKIP.has(tag.toLowerCase()) && !/^[A-Z]{2,}\d/i.test(tag);
}

/** Closed vocabulary only, canonical strings, first-seen order. */
export function topicKeywords(tags: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const canonical = canonicalTopicTag(tag);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export function colorForTopic(tag: string) {
  const canonical = canonicalTopicTag(tag) ?? tag;
  const index = (TOPIC_VOCABULARY as readonly string[]).indexOf(canonical);
  return KEYWORD_PALETTE[index >= 0 ? index : 0]!;
}

export function colorForHub(label: string) {
  const canonical = canonicalTopicTag(label);
  if (canonical) return colorForTopic(canonical);
  let hash = 2166136261;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return KEYWORD_PALETTE[(hash >>> 0) % KEYWORD_PALETTE.length]!;
}

export function vocabularyPresent(tagLists: string[][]) {
  const present = new Set(tagLists.flatMap(topicKeywords));
  return TOPIC_VOCABULARY.filter(tag => present.has(tag));
}

export type GraphNodeKind = "major" | "minor" | "leaf";

export type GraphNodeDatum = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  count: number;
  pageId?: string;
  /** Owning major keyword label (minors + leaves). */
  parentKeyword?: string;
  /** Every topic this note belongs to (Show All colouring and notebook/degree spokes). */
  hubLabels?: string[];
  color: string;
  soft: string;
  ink: string;
  r: number;
  expanded?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  homeX?: number;
  homeY?: number;
  opacity?: number;
  departing?: boolean;
};

export type GraphLinkKind = "backbone" | "orbit" | "spoke" | "overlap";

export type GraphLinkDatum = {
  source: string | GraphNodeDatum;
  target: string | GraphNodeDatum;
  kind: GraphLinkKind;
  weight: number;
  color: string;
};

export type ArchiveGraphModel = {
  nodes: GraphNodeDatum[];
  links: GraphLinkDatum[];
  majorCount: number;
  minorCount: number;
  /** Sample notes under a minor (or major with no minors). */
  leaves: Map<string, PageManifestEntry[]>;
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

export function rankTopicNotes(entries: PageManifestEntry[]) {
  return [...entries].sort((a, b) => {
    const created = (b.created_at ?? "").localeCompare(a.created_at ?? "");
    if (created) return created;
    return a.title.localeCompare(b.title);
  });
}

export function constellationLeafId(hubId: string, pageId: string) {
  return `leaf:${hubId}:${pageId}`;
}

export function placeHubLeaves(hub: GraphNodeDatum, notes: PageManifestEntry[]) {
  const nodes: GraphNodeDatum[] = [];
  const links: GraphLinkDatum[] = [];
  if (!notes.length || hub.x == null || hub.y == null) return { nodes, links };
  const radius = 58 + notes.length * 4;
  notes.forEach((note, index) => {
    const angle = (Math.PI * 2 * index) / notes.length - Math.PI / 2;
    const node: GraphNodeDatum = {
      id: constellationLeafId(hub.id, note.id),
      kind: "leaf",
      label: note.title,
      count: 1,
      pageId: note.id,
      parentKeyword: hub.label,
      color: hub.color,
      soft: hub.soft,
      ink: hub.ink,
      r: 6,
      x: hub.x! + Math.cos(angle) * radius,
      y: hub.y! + Math.sin(angle) * radius,
    };
    nodes.push(node);
    links.push({
      source: hub.id,
      target: node.id,
      kind: "spoke",
      weight: 1,
      color: hub.color,
    });
  });
  return { nodes, links };
}

function restoreConstellationBase(model: ArchiveGraphModel, liveNodes: GraphNodeDatum[]) {
  const liveById = new Map(liveNodes.map(node => [node.id, node]));
  return {
    nodes: model.nodes.map(node => {
      const live = liveById.get(node.id);
      return {
        ...node,
        expanded: false,
        x: live?.x ?? node.x,
        y: live?.y ?? node.y,
      };
    }),
    links: model.links.map(link => ({ ...link })),
  };
}

export function collapseConstellation(model: ArchiveGraphModel, liveNodes: GraphNodeDatum[]) {
  return restoreConstellationBase(model, liveNodes);
}

/** Open a hub's notes, or close it if it is already open. */
export function applyConstellationHubClick(
  model: ArchiveGraphModel,
  liveNodes: GraphNodeDatum[],
  label: string,
) {
  const wasExpanded = liveNodes.some(node => node.kind !== "leaf" && node.label === label && node.expanded);
  const restored = restoreConstellationBase(model, liveNodes);
  if (wasExpanded) return { ...restored, expandedLabel: null as string | null };

  const hub = restored.nodes.find(node => node.kind !== "leaf" && node.label === label);
  if (!hub) return { ...restored, expandedLabel: null as string | null };
  hub.expanded = true;

  const previewIds = new Set(
    restored.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === label).map(node => node.id),
  );
  const nodes = restored.nodes.filter(node => !previewIds.has(node.id));
  const links = restored.links.filter(link => {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    return !previewIds.has(source) && !previewIds.has(target);
  });

  const attached = placeHubLeaves(hub, model.leaves.get(label) ?? []);
  return {
    nodes: [...nodes, ...attached.nodes],
    links: [...links, ...attached.links],
    expandedLabel: label,
  };
}

export function buildArchiveGraph(entries: PageManifestEntry[]): ArchiveGraphModel {
  const counts = new Map<string, number>();
  const pagesByKeyword = new Map<string, PageManifestEntry[]>();
  const pairWeights = new Map<string, number>();

  for (const entry of entries) {
    const keywords = [...new Set(topicKeywords(entry.tags))];
    if (!keywords.length) continue;
    for (const keyword of keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
      const list = pagesByKeyword.get(keyword) ?? [];
      list.push(entry);
      pagesByKeyword.set(keyword, list);
    }
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const key = pairKey(keywords[i], keywords[j]);
        pairWeights.set(key, (pairWeights.get(key) ?? 0) + 1);
      }
    }
  }

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxCount = ordered[0]?.[1] ?? 1;
  const majors = ordered.slice(0, MAJOR_COUNT);
  const minors = ordered.slice(MAJOR_COUNT);
  const majorSet = new Set(majors.map(([label]) => label));

  const colorByKeyword = new Map<string, (typeof KEYWORD_PALETTE)[number]>();
  for (const [label] of ordered) colorByKeyword.set(label, colorForTopic(label));

  const ownerOf = new Map<string, string>();
  for (const [label] of minors) {
    let bestOwner = majors[0]?.[0] ?? label;
    let bestWeight = -1;
    for (const [major] of majors) {
      const weight = pairWeights.get(pairKey(label, major)) ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestOwner = major;
      }
    }
    ownerOf.set(label, bestOwner);
  }

  const nodes: GraphNodeDatum[] = [];
  const majorIndex = new Map<string, number>();

  majors.forEach(([label, count], index) => {
    majorIndex.set(label, index);
    const palette = colorByKeyword.get(label)!;
    const angle = (Math.PI * 2 * index) / Math.max(majors.length, 1) - Math.PI / 2;
    const orbit = Math.max(520, 240 + majors.length * 28);
    nodes.push({
      id: `major:${label}`,
      kind: "major",
      label,
      count,
      color: palette.fill,
      soft: palette.soft,
      ink: palette.ink,
      r: 26 + Math.sqrt(count / maxCount) * 34,
      expanded: false,
      x: 760 + Math.cos(angle) * orbit,
      y: 560 + Math.sin(angle) * orbit,
    });
  });

  const minorsByOwner = new Map<string, string[]>();
  for (const [label] of minors) {
    const owner = ownerOf.get(label)!;
    const list = minorsByOwner.get(owner) ?? [];
    list.push(label);
    minorsByOwner.set(owner, list);
  }

  for (const [label, count] of minors) {
    const owner = ownerOf.get(label)!;
    const palette = colorByKeyword.get(label)!;
    const siblings = minorsByOwner.get(owner) ?? [label];
    const siblingIndex = siblings.indexOf(label);
    const ownerNode = nodes.find(node => node.id === `major:${owner}`)!;
    const baseAngle =
      Math.atan2((ownerNode.y ?? 560) - 560, (ownerNode.x ?? 760) - 760) +
      ((siblingIndex - (siblings.length - 1) / 2) * Math.PI) / 5;
    const radius = 150 + siblingIndex * 12;
    nodes.push({
      id: `minor:${label}`,
      kind: "minor",
      label,
      count,
      parentKeyword: owner,
      color: palette.fill,
      soft: palette.soft,
      ink: palette.ink,
      r: 12 + Math.sqrt(count / maxCount) * 10,
      expanded: false,
      x: (ownerNode.x ?? 760) + Math.cos(baseAngle) * radius,
      y: (ownerNode.y ?? 560) + Math.sin(baseAngle) * radius,
    });
  }

  const links: GraphLinkDatum[] = [];

  // Major ↔ major backbone (synthesised relationships).
  const backbone = [...pairWeights.entries()]
    .map(([key, weight]) => {
      const [a, b] = key.split("||");
      return { a, b, weight };
    })
    .filter(edge => majorSet.has(edge.a) && majorSet.has(edge.b) && edge.weight >= BACKBONE_MIN_WEIGHT)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, BACKBONE_MAX_EDGES);

  for (const edge of backbone) {
    links.push({
      source: `major:${edge.a}`,
      target: `major:${edge.b}`,
      kind: "backbone",
      weight: edge.weight,
      color: colorByKeyword.get(edge.a)!.fill,
    });
  }

  // Major → minor ownership orbits (local constellation, not cross-hub clones).
  for (const [label] of minors) {
    const owner = ownerOf.get(label)!;
    links.push({
      source: `major:${owner}`,
      target: `minor:${label}`,
      kind: "orbit",
      weight: pairWeights.get(pairKey(label, owner)) ?? 1,
      color: colorByKeyword.get(owner)!.fill,
    });
  }

  const leaves = new Map<string, PageManifestEntry[]>();
  for (const [label] of ordered) {
    leaves.set(label, rankTopicNotes(pagesByKeyword.get(label) ?? []).slice(0, LEAF_SAMPLE));
  }

  for (const hub of [...nodes]) {
    if (hub.kind !== "major" && hub.kind !== "minor") continue;
    const preview = (leaves.get(hub.label) ?? []).slice(0, CONSTELLATION_PREVIEW);
    const attached = placeHubLeaves(hub, preview);
    nodes.push(...attached.nodes);
    links.push(...attached.links);
  }

  return {
    nodes,
    links,
    majorCount: majors.length,
    minorCount: minors.length,
    leaves,
  };
}
