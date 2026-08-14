import { describe, expect, it } from "vitest";
import { mapInBatches } from "./loadLocalPages";

describe("mapInBatches", () => {
  it("does not fire every item at once", async () => {
    const seen: number[] = [];
    const result = await mapInBatches([1, 2, 3, 4, 5], 2, async chunk => {
      seen.push(chunk.length);
      return chunk.map(n => n * 2);
    });
    expect(seen).toEqual([2, 2, 1]);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });
});
