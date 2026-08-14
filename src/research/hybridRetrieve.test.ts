import { describe, expect, it } from "vitest";
import { hybridRetrieve, reciprocalRankFuse } from "./hybridRetrieve";

describe("reciprocalRankFuse", () => {
  it("boosts items that appear high in both lists", () => {
    const fused = reciprocalRankFuse([
      [{ pageId: "a" }, { pageId: "b" }],
      [{ pageId: "b" }, { pageId: "c" }],
    ]);
    expect([...fused.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]).toBe("b");
  });
});

describe("hybridRetrieve", () => {
  it("rank-fuses lexical hits with vector hits instead of falling back", () => {
    const hits = hybridRetrieve({
      query: "stoic therapy",
      manifest: [
        { id: "lex", title: "Stoic therapy notes", excerpt: "CBT and stoicism", tags: ["philosophy"], area: "notes" },
        { id: "vec", title: "Unrelated title", excerpt: "gardening", tags: [], area: "notes" },
      ],
      index: [
        { pageId: "lex", title: "Stoic therapy notes", vector: [1, 0] },
        { pageId: "vec", title: "Unrelated title", vector: [0.99, 0.1] },
      ],
      queryVector: [0, 1],
      k: 2,
    });
    expect(hits.map(hit => hit.pageId).sort()).toEqual(["lex", "vec"]);
  });

  it("still returns lexical hits when no query vector is available", () => {
    const hits = hybridRetrieve({
      query: "stoic therapy",
      manifest: [
        { id: "lex", title: "Stoic therapy notes", excerpt: "CBT", tags: [], area: "notes" },
        { id: "other", title: "Baking", excerpt: "flour", tags: [], area: "notes" },
      ],
      index: [],
      queryVector: null,
      k: 8,
    });
    expect(hits.map(hit => hit.pageId)).toEqual(["lex"]);
  });
});
