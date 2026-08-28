import { describe, expect, it } from "vitest";
import {
  SHOW_ALL_DEGREE_CAP,
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

  it("builds a connected maximum spanning tree even when clusters do not overlap", () => {
    const tree = maximumSpanningTree(4, [
      { a: 0, b: 1, score: 2 },
      { a: 2, b: 3, score: 2 },
    ]);
    expect(tree).toHaveLength(3);
    const uf = new Map<number, number>();
    const find = (i: number): number => {
      const next = uf.get(i) ?? i;
      return next === i ? i : find(next);
    };
    for (let i = 0; i < 4; i++) uf.set(i, i);
    for (const pair of tree) uf.set(find(pair.a), find(pair.b));
    expect(new Set([0, 1, 2, 3].map(find)).size).toBe(1);
  });

  it("never drops protected backbone edges when capping degree", () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ a: 0, b: i + 1, score: 40 - i }));
    const protectedKeys = new Set(pairs.slice(0, 5).map(pair => `0|${pair.b}`));
    const kept = capDegree(pairs, protectedKeys, 8);
    const hubDegree = kept.filter(pair => pair.a === 0 || pair.b === 0).length;
    expect(hubDegree).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
    expect(protectedKeys.size).toBe(5);
    for (const key of protectedKeys) {
      const [a, b] = key.split("|").map(Number);
      expect(kept.some(pair => pair.a === a && pair.b === b)).toBe(true);
    }
  });
});
