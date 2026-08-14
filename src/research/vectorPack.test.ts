import { describe, expect, it } from "vitest";
import { packVectorIndex, unpackVectorIndex } from "./vectorPack";

describe("vectorPack", () => {
  it("round-trips page ids and float32 vectors without JSON number arrays", () => {
    const packed = packVectorIndex([
      { pageId: "a", title: "Alpha", vector: [1, 0, 0] },
      { pageId: "b", title: "Beta", vector: [0, 1, 0] },
    ]);
    expect(packed.bytes.byteLength).toBeLessThan(JSON.stringify([{ vector: [1, 0, 0] }]).length * 4);
    const unpacked = unpackVectorIndex(packed.meta, packed.bytes);
    expect(unpacked.map(entry => entry.pageId)).toEqual(["a", "b"]);
    expect(Array.from(unpacked[0]?.vector ?? [])).toEqual([1, 0, 0]);
    expect(Array.from(unpacked[1]?.vector ?? []).slice(0, 2)).toEqual([0, 1]);
  });
});
