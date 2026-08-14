import { describe, expect, it } from "vitest";
import { packVectorIndex } from "./vectorPack";
import { loadCorpusCached, resetCorpusCache } from "./corpusCache";

describe("loadCorpusCached", () => {
  it("reads packed vectors and manifest from R2 once, then reuses memory", async () => {
    resetCorpusCache();
    const packed = packVectorIndex([{ pageId: "p1", title: "T", vector: [1, 0] }]);
    const reads: string[] = [];
    const loader = {
      text: async (key: string) => {
        reads.push(key);
        if (key === "research/index-meta.json") return JSON.stringify(packed.meta);
        if (key === "research/manifest.json")
          return JSON.stringify([{ id: "p1", title: "T", excerpt: "e", tags: [], area: "notes", path: "pages/p1.json" }]);
        return null;
      },
      bytes: async (key: string) => {
        reads.push(key);
        if (key === "research/vectors.bin") return packed.bytes.buffer.slice(packed.bytes.byteOffset, packed.bytes.byteOffset + packed.bytes.byteLength);
        return null;
      },
    };
    const first = await loadCorpusCached(loader);
    const second = await loadCorpusCached(loader);
    expect(reads.sort()).toEqual(["research/index-meta.json", "research/manifest.json", "research/vectors.bin"]);
    expect(first.index).toHaveLength(1);
    expect(Array.from(first.index[0]?.vector ?? [])).toEqual([1, 0]);
    expect(second.manifest[0]?.id).toBe("p1");
  });
});
