import { describe, expect, it } from "vitest";
import {
  SHOW_ALL_DEGREE_CAP,
  candidatePairs,
  capDegree,
  knnUnion,
  maximumSpanningTree,
  tagIdf,
} from "./showAllEdges";

describe("show all edge helpers", () => {
  it("weights rare tags above popular ones", () => {
    expect(tagIdf(2)).toBeGreaterThan(tagIdf(600));
  });

  it("takes a union of each node's top-k neighbours", () => {
    const pairs = [
      { a: 0, b: 1, score: 3 },
      { a: 0, b: 2, score: 2 },
      { a: 0, b: 3, score: 1 },
      { a: 1, b: 2, score: 0.4 },
    ];
    const knn = knnUnion(4, pairs, 1);
    expect(knn).toEqual(
      expect.arrayContaining([
        { a: 0, b: 1, score: 3 },
        { a: 0, b: 2, score: 2 },
        { a: 0, b: 3, score: 1 },
      ]),
    );
    expect(knn).not.toContainEqual({ a: 1, b: 2, score: 0.4 });
  });

  it("builds a spanning tree only from real scored pairs", () => {
    const tree = maximumSpanningTree(4, [
      { a: 0, b: 1, score: 2 },
      { a: 2, b: 3, score: 2 },
    ]);
    expect(tree).toHaveLength(2);
    expect(tree).toEqual(
      expect.arrayContaining([
        { a: 0, b: 1, score: 2 },
        { a: 2, b: 3, score: 2 },
      ]),
    );
  });

  it("does not enumerate every pair inside a huge shared tag", () => {
    const tagSets = Array.from({ length: 80 }, () => new Set(["shared"]));
    const tokens = tagSets.map((_, index) => new Set([`tok-${index}`]));
    const { candidates } = candidatePairs(tagSets, tokens);
    expect(candidates.size).toBeLessThan((80 * 79) / 2);
    expect(candidates.size).toBeGreaterThanOrEqual(79);
  });

  it("never lets a note exceed the degree cap, even for former backbone pairs", () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ a: 0, b: i + 1, score: 40 - i }));
    const protectedKeys = new Set(pairs.slice(0, 5).map(pair => `0|${pair.b}`));
    const kept = capDegree(pairs, protectedKeys, SHOW_ALL_DEGREE_CAP);
    const hubDegree = kept.filter(pair => pair.a === 0 || pair.b === 0).length;
    expect(hubDegree).toBe(SHOW_ALL_DEGREE_CAP);
    const degree = new Map<number, number>();
    for (const pair of kept) {
      degree.set(pair.a, (degree.get(pair.a) ?? 0) + 1);
      degree.set(pair.b, (degree.get(pair.b) ?? 0) + 1);
    }
    expect(Math.max(...degree.values())).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
  });
});
