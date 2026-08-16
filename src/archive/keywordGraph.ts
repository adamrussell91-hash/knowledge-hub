import type { PageManifestEntry } from "../domain/page";

const SKIP = new Set(["note", "lecture", "assessment", "tutorial", "study note", "seminar", "test"]);

/** Top keywords become major hubs; the rest become owned minor sub-themes. */
const MAJOR_COUNT = 8;
const BACKBONE_MIN_WEIGHT = 3;
const BACKBONE_MAX_EDGES = 22;
const LEAF_SAMPLE = 14;

export const KEYWORD_PALETTE = [
  { fill: "#7eb0d5", soft: "rgba(126, 176, 213, 0.7)", ink: "#315875" },
  { fill: "#88b39a", soft: "rgba(136, 179, 154, 0.7)", ink: "#44604e" },
  { fill: "#d4b96a", soft: "rgba(212, 185, 106, 0.7)", ink: "#6c581f" },
  { fill: "#d4a07f", soft: "rgba(212, 160, 127, 0.7)", ink: "#77503a" },
  { fill: "#b5a3d1", soft: "rgba(181, 163, 209, 0.7)", ink: "#5d4d72" },
  { fill: "#6f9ec4", soft: "rgba(111, 158, 196, 0.7)", ink: "#294c71" },
  { fill: "#9cbf8f", soft: "rgba(156, 191, 143, 0.7)", ink: "#3c5949" },
  { fill: "#c9a35c", soft: "rgba(201, 163, 92, 0.7)", ink: "#6c581f" },
  { fill: "#c98b78", soft: "rgba(201, 139, 120, 0.7)", ink: "#7a5038" },
  { fill: "#9f8fc2", soft: "rgba(159, 143, 194, 0.7)", ink: "#5d4e70" },
  { fill: "#5f8fb8", soft: "rgba(95, 143, 184, 0.7)", ink: "#315875" },
  { fill: "#7aa68a", soft: "rgba(122, 166, 138, 0.7)", ink: "#44604e" },
  { fill: "#b8974e", soft: "rgba(184, 151, 78, 0.7)", ink: "#6c581f" },
  { fill: "#b87d68", soft: "rgba(184, 125, 104, 0.7)", ink: "#77503a" },
  { fill: "#8f7eb0", soft: "rgba(143, 126, 176, 0.7)", ink: "#5d4d72" },
] as const;

export function isTopicKeyword(tag: string) {
  return !SKIP.has(tag.toLowerCase()) && !/^[A-Z]{2,}\d/i.test(tag);
}

export function topicKeywords(tags: string[]) {
  return tags.filter(isTopicKeyword);
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
  majors.forEach(([label], index) => colorByKeyword.set(label, KEYWORD_PALETTE[index % KEYWORD_PALETTE.length]));

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
    colorByKeyword.set(label, colorByKeyword.get(bestOwner)!);
  }

  const nodes: GraphNodeDatum[] = [];
  const majorIndex = new Map<string, number>();

  majors.forEach(([label, count], index) => {
    majorIndex.set(label, index);
    const palette = colorByKeyword.get(label)!;
    const angle = (Math.PI * 2 * index) / Math.max(majors.length, 1) - Math.PI / 2;
    const orbit = 480;
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
    leaves.set(label, (pagesByKeyword.get(label) ?? []).slice(0, LEAF_SAMPLE));
  }

  return {
    nodes,
    links,
    majorCount: majors.length,
    minorCount: minors.length,
    leaves,
  };
}
