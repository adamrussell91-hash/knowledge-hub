import { describe, expect, it } from "vitest";
import { packVectorIndex } from "../research/vectorPack";
import { corpusFromResearchPack } from "./corpusLoad";

describe("corpusFromResearchPack", () => {
  it("joins packed vectors with manifest excerpts", () => {
    const packed = packVectorIndex([
      { pageId: "a", title: "Alpha", vector: [1, 0] },
      { pageId: "b", title: "Beta", vector: [0, 1] },
    ]);
    const corpus = corpusFromResearchPack({
      meta: packed.meta,
      bytes: packed.bytes,
      manifest: [{ id: "a", excerpt: "first" }, { id: "b", excerpt: "second" }],
    });
    expect(corpus.map(entry => ({ id: entry.pageId, excerpt: entry.excerpt }))).toEqual([
      { id: "a", excerpt: "first" },
      { id: "b", excerpt: "second" },
    ]);
    expect(Array.from(corpus[0]?.vector ?? [])).toEqual([1, 0]);
  });
});
