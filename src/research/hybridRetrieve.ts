import { lexicalRetrieve, type LexicalDoc } from "../lib/lexicalRetrieve";

export type VectorDoc = {
  pageId: string;
  title: string;
  vector: number[];
};

export type Candidate = {
  pageId: string;
  title: string;
  excerpt: string;
  score: number;
};

const RRF_K = 60;

function cosine(left: number[], right: number[]) {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const magnitude = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  const divisor = magnitude(left) * magnitude(right);
  return divisor ? dot / divisor : 0;
}

export function reciprocalRankFuse(rankedLists: { pageId: string }[][], rrfK = RRF_K) {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((item, index) => {
      scores.set(item.pageId, (scores.get(item.pageId) ?? 0) + 1 / (rrfK + index + 1));
    });
  }
  return scores;
}

export function hybridRetrieve(input: {
  query: string;
  manifest: LexicalDoc[];
  index: VectorDoc[];
  queryVector: number[] | null;
  k?: number;
}): Candidate[] {
  const k = input.k ?? 24;
  const byId = new Map(input.manifest.map(doc => [doc.id, doc]));
  const lexical = lexicalRetrieve(input.manifest, input.query, k);
  const vector =
    input.queryVector && input.index.length
      ? [...input.index]
          .sort(
            (left, right) =>
              cosine(right.vector, input.queryVector as number[]) -
              cosine(left.vector, input.queryVector as number[]),
          )
          .slice(0, k)
          .map(entry => ({ pageId: entry.pageId, title: entry.title }))
      : [];

  const fused = input.queryVector && vector.length ? reciprocalRankFuse([lexical.map(hit => ({ pageId: hit.id })), vector]) : null;

  const orderedIds = fused
    ? [...fused.entries()].sort((left, right) => right[1] - left[1]).map(([pageId]) => pageId)
    : lexical.map(hit => hit.id);

  return orderedIds.slice(0, k).flatMap(pageId => {
    const doc = byId.get(pageId);
    const lexicalHit = lexical.find(hit => hit.id === pageId);
    const title = doc?.title ?? vector.find(item => item.pageId === pageId)?.title;
    if (!title) return [];
    return [
      {
        pageId,
        title,
        excerpt: doc?.excerpt ?? "",
        score: fused?.get(pageId) ?? lexicalHit?.score ?? 0,
      },
    ];
  });
}
