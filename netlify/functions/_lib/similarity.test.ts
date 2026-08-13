import { describe, expect, it } from "vitest";
import { topKBySimilarity } from "./similarity";
describe("topKBySimilarity", () => it("returns the closest vectors first", () => expect(topKBySimilarity([{ pageId: "a", title: "A", excerpt: "", vector: [1, 0] }, { pageId: "b", title: "B", excerpt: "", vector: [0, 1] }], [1, 0], 1).map(x => x.pageId)).toEqual(["a"])));
