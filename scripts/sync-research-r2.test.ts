import { describe, expect, it } from "vitest";
import { researchObjectKeys } from "./sync-research-r2";

describe("researchObjectKeys", () => {
  it("namespaces kernel artifacts under research/", () => {
    expect(researchObjectKeys.vectors).toBe("research/vectors.bin");
    expect(researchObjectKeys.indexMeta).toBe("research/index-meta.json");
    expect(researchObjectKeys.manifest).toBe("research/manifest.json");
    expect(researchObjectKeys.page("abc")).toBe("research/pages/abc.json");
  });
});
