import { tokenize } from "../lib/lexicalRetrieve";
import type { PageManifestEntry } from "../domain/page";
import type { GraphLinkDatum } from "./keywordGraph";
import { UnionFind } from "./showAllCommunities";

export const SHOW_ALL_KNN = 5;
export const SHOW_ALL_DEGREE_CAP = 16;
const SMALL_TAG = 48;
/** Extra neighbours sampled per note inside a huge tag — avoids O(n²) Jaccard scans. */
const LARGE_TAG_SAMPLE = SHOW_ALL_KNN + 16;
const RARE_TOKEN_DF = 16;

export type ScoredPair = { a: number; b: number; score: number };

function pairKey(a: number, b: number) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function tagIdf(freq: number) {
  return 1 / Math.log(1 + Math.max(freq, 1));
}

export function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) return 0;
  let inter = 0;
  const [small, big] = left.size < right.size ? [left, right] : [right, left];
  for (const token of small) if (big.has(token)) inter += 1;
  return inter / (left.size + right.size - inter || 1);
}

export function scoreNotePair(
  leftTags: Set<string>,
  rightTags: Set<string>,
  leftTokens: Set<string>,
  rightTokens: Set<string>,
  tagFreq: Map<string, number>,
) {
  let tagScore = 0;
  for (const tag of leftTags) {
    if (rightTags.has(tag)) tagScore += tagIdf(tagFreq.get(tag) ?? 1);
  }
  return tagScore * 2 + jaccard(leftTokens, rightTokens);
}

function pushTop(list: ScoredPair[], pair: ScoredPair, k: number) {
  if (list.length < k) {
    list.push(pair);
    list.sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
    return;
  }
  const weakest = list[list.length - 1]!;
  if (pair.score < weakest.score) return;
  if (pair.score === weakest.score && (pair.a > weakest.a || (pair.a === weakest.a && pair.b >= weakest.b))) {
    return;
  }
  list[list.length - 1] = pair;
  list.sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
}

export function knnUnion(n: number, pairs: ScoredPair[], k = SHOW_ALL_KNN) {
  const best = Array.from({ length: n }, () => [] as ScoredPair[]);
  for (const pair of pairs) {
    pushTop(best[pair.a]!, pair, k);
    pushTop(best[pair.b]!, pair, k);
  }
  const seen = new Set<string>();
  const out: ScoredPair[] = [];
  for (const list of best) {
    for (const pair of list) {
      const key = pairKey(pair.a, pair.b);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
  }
  return out;
}

export function maximumSpanningTree(n: number, pairs: ScoredPair[]): ScoredPair[] {
  if (n <= 1) return [];
  const ordered = [...pairs].sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
  const uf = new UnionFind(n);
  const tree: ScoredPair[] = [];
  for (const pair of ordered) {
    if (uf.union(pair.a, pair.b)) {
      tree.push(pair);
      if (tree.length === n - 1) return tree;
    }
  }
  const reps = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!reps.has(root)) reps.set(root, i);
  }
  const members = [...reps.values()];
  const anchor = members[0] ?? 0;
  for (let i = 1; i < members.length; i++) {
    tree.push({ a: anchor, b: members[i]!, score: 0.01 });
  }
  return tree;
}

export function capDegree(pairs: ScoredPair[], protectedKeys: Set<string>, cap = SHOW_ALL_DEGREE_CAP) {
  const degree = new Map<number, number>();
  const kept: ScoredPair[] = [];
  const ordered = [...pairs].sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
  for (const pair of ordered) {
    const key = pairKey(pair.a, pair.b);
    const left = degree.get(pair.a) ?? 0;
    const right = degree.get(pair.b) ?? 0;
    if (!protectedKeys.has(key) && (left >= cap || right >= cap)) continue;
    degree.set(pair.a, left + 1);
    degree.set(pair.b, right + 1);
    kept.push(pair);
  }
  return kept;
}

function addCandidate(candidates: Set<string>, i: number, j: number) {
  if (i === j) return;
  candidates.add(pairKey(i, j));
}

function parseKey(key: string) {
  const [a, b] = key.split("|").map(Number);
  return { a: a!, b: b! };
}

export function candidatePairs(
  tagSets: Set<string>[],
  tokens: Set<string>[],
) {
  const n = tagSets.length;
  const candidates = new Set<string>();
  const byTag = new Map<string, number[]>();
  tagSets.forEach((tags, index) => {
    for (const tag of tags) {
      const list = byTag.get(tag) ?? [];
      list.push(index);
      byTag.set(tag, list);
    }
  });

  for (const members of byTag.values()) {
    if (members.length <= SMALL_TAG) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) addCandidate(candidates, members[i]!, members[j]!);
      }
      continue;
    }
    const take = Math.min(LARGE_TAG_SAMPLE, members.length - 1);
    for (let i = 0; i < members.length; i++) {
      const a = members[i]!;
      for (let step = 1, picked = 0; picked < take && step < members.length; step++) {
        const b = members[(i + step * 17) % members.length]!;
        if (b === a) continue;
        addCandidate(candidates, a, b);
        picked += 1;
      }
    }
  }

  const byToken = new Map<string, number[]>();
  tokens.forEach((set, index) => {
    for (const token of set) {
      const list = byToken.get(token) ?? [];
      list.push(index);
      byToken.set(token, list);
    }
  });
  for (const members of byToken.values()) {
    if (members.length < 2 || members.length > RARE_TOKEN_DF) continue;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) addCandidate(candidates, members[i]!, members[j]!);
    }
  }

  return { candidates, n };
}

export function scoreCandidates(
  candidates: Set<string>,
  tagSets: Set<string>[],
  tokens: Set<string>[],
  tagFreq: Map<string, number>,
) {
  const pairs: ScoredPair[] = [];
  for (const key of candidates) {
    const { a, b } = parseKey(key);
    const score = scoreNotePair(tagSets[a]!, tagSets[b]!, tokens[a]!, tokens[b]!, tagFreq);
    if (score <= 0) continue;
    pairs.push({ a, b, score });
  }
  return pairs;
}

export type ShowAllEdgeBuild = {
  links: GraphLinkDatum[];
  degree: number[];
  pairs: ScoredPair[];
};

export function buildShowAllNoteEdges(
  eligible: PageManifestEntry[],
  labelsByEntry: string[][],
  leafId = (entry: PageManifestEntry) => `leaf:${entry.id}`,
): ShowAllEdgeBuild {
  const tagSets = labelsByEntry.map(labels => new Set(labels));
  const tagFreq = new Map<string, number>();
  for (const tags of tagSets) {
    for (const tag of tags) tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
  }
  const tokens = eligible.map((entry, index) => {
    const labels = labelsByEntry[index] ?? [];
    return new Set(tokenize(`${entry.title} ${entry.excerpt} ${labels.join(" ")}`));
  });

  const { candidates } = candidatePairs(tagSets, tokens);
  const scored = scoreCandidates(candidates, tagSets, tokens, tagFreq);
  const knn = knnUnion(eligible.length, scored);
  const knnKeys = new Set(knn.map(pair => pairKey(pair.a, pair.b)));
  const tree = maximumSpanningTree(eligible.length, scored);
  const protectedKeys = new Set(tree.map(pair => pairKey(pair.a, pair.b)));
  const merged = new Map<string, ScoredPair>();
  for (const pair of [...knn, ...tree]) merged.set(pairKey(pair.a, pair.b), pair);
  const capped = capDegree([...merged.values()], protectedKeys);

  const degree = new Array<number>(eligible.length).fill(0);
  const links: GraphLinkDatum[] = capped.map(pair => {
    degree[pair.a] += 1;
    degree[pair.b] += 1;
    const key = pairKey(pair.a, pair.b);
    return {
      source: leafId(eligible[pair.a]!),
      target: leafId(eligible[pair.b]!),
      kind: protectedKeys.has(key) && !knnKeys.has(key) ? "backbone" : "overlap",
      weight: Math.max(0.05, pair.score),
      color: "rgba(160, 160, 160, 0.7)",
    };
  });

  return { links, degree, pairs: capped };
}
