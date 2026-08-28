import { KEYWORD_PALETTE } from "./keywordGraph";
import { tokenize } from "../lib/lexicalRetrieve";

export type CommunityEdge = { source: number; target: number; weight: number };

export type CommunityAssignment = {
  community: number[];
  modularity: number;
  count: number;
};

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]!);
    return this.parent[i]!;
  }
  union(a: number, b: number) {
    const left = this.find(a);
    const right = this.find(b);
    if (left === right) return false;
    this.parent[left] = right;
    return true;
  }
}

function modularityOf(
  n: number,
  communities: number[],
  edges: CommunityEdge[],
  resolution: number,
) {
  if (!n) return 0;
  let m = 0;
  const degree = new Array<number>(n).fill(0);
  for (const edge of edges) {
    m += edge.weight;
    degree[edge.source] += edge.weight;
    degree[edge.target] += edge.weight;
  }
  if (m === 0) return 0;
  let q = 0;
  for (const edge of edges) {
    if (communities[edge.source] === communities[edge.target]) q += edge.weight;
  }
  const byComm = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const comm = communities[i]!;
    byComm.set(comm, (byComm.get(comm) ?? 0) + degree[i]!);
  }
  for (const deg of byComm.values()) q -= (resolution * deg * deg) / (4 * m);
  return q / m;
}

/** Greedy Louvain-style aggregation. Fast enough for a few thousand notes. */
export function assignCommunities(
  n: number,
  edges: CommunityEdge[],
  resolution = 0.8,
): CommunityAssignment {
  if (n <= 0) return { community: [], modularity: 0, count: 0 };
  let community = Array.from({ length: n }, (_, i) => i);
  const neighbors = Array.from({ length: n }, () => new Map<number, number>());
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    neighbors[edge.source]!.set(edge.target, (neighbors[edge.source]!.get(edge.target) ?? 0) + edge.weight);
    neighbors[edge.target]!.set(edge.source, (neighbors[edge.target]!.get(edge.source) ?? 0) + edge.weight);
  }

  let moved = true;
  let passes = 0;
  while (moved && passes < 12) {
    moved = false;
    passes += 1;
    for (let i = 0; i < n; i++) {
      const counts = new Map<number, number>();
      for (const [j, weight] of neighbors[i]!) {
        const comm = community[j]!;
        counts.set(comm, (counts.get(comm) ?? 0) + weight);
      }
      let best = community[i]!;
      let bestScore = counts.get(best) ?? 0;
      for (const [comm, score] of counts) {
        const adjusted = score / resolution;
        if (adjusted > bestScore || (adjusted === bestScore && comm < best)) {
          best = comm;
          bestScore = adjusted;
        }
      }
      if (best !== community[i]) {
        community[i] = best;
        moved = true;
      }
    }
  }

  const compact = new Map<number, number>();
  const remapped = community.map(comm => {
    const existing = compact.get(comm);
    if (existing != null) return existing;
    const next = compact.size;
    compact.set(comm, next);
    return next;
  });
  return {
    community: remapped,
    modularity: modularityOf(n, remapped, edges, resolution),
    count: compact.size,
  };
}

export function communityPalette(index: number) {
  return KEYWORD_PALETTE[index % KEYWORD_PALETTE.length]!;
}

export function nameCommunities(titles: string[], community: number[], count: number) {
  const docs = titles.map(title => tokenize(title));
  const df = new Map<string, number>();
  for (const tokens of docs) {
    for (const token of new Set(tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const names: string[] = [];
  for (let comm = 0; comm < count; comm++) {
    const tf = new Map<string, number>();
    let members = 0;
    docs.forEach((tokens, index) => {
      if (community[index] !== comm) return;
      members += 1;
      for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    });
    const ranked = [...tf.entries()]
      .map(([token, freq]) => {
        const idf = Math.log((members + 1) / ((df.get(token) ?? 1) + 1)) + 1;
        return { token, score: freq * idf };
      })
      .sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
    names[comm] = ranked
      .slice(0, 2)
      .map(item => item.token)
      .join(" · ");
  }
  return names;
}

export function importantByCommunity(degree: number[], community: number[], count: number, perCommunity = 2) {
  const important = new Array<boolean>(degree.length).fill(false);
  for (let comm = 0; comm < count; comm++) {
    const members = degree
      .map((value, index) => ({ value, index }))
      .filter(item => community[item.index] === comm)
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .slice(0, perCommunity);
    for (const item of members) important[item.index] = true;
  }
  return important;
}

export { UnionFind };
