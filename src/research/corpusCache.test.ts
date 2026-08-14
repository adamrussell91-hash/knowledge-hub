import { describe, expect, it } from "vitest";
import { loadCorpusCached, resetCorpusCache } from "./corpusCache";

describe("loadCorpusCached", () => {
  it("reads index and manifest from R2 once, then reuses memory", async () => {
    resetCorpusCache();
    let reads = 0;
    const getObject = async (key: string) => {
      reads += 1;
      if (key === "research/index.json") return JSON.stringify([{ pageId: "p1", title: "T", vector: [1] }]);
      if (key === "research/manifest.json")
        return JSON.stringify([{ id: "p1", title: "T", excerpt: "e", tags: [], area: "notes", path: "pages/p1.json" }]);
      return null;
    };
    const first = await loadCorpusCached(getObject);
    const second = await loadCorpusCached(getObject);
    expect(reads).toBe(2);
    expect(first.index).toHaveLength(1);
    expect(second.manifest[0]?.id).toBe("p1");
  });
});
