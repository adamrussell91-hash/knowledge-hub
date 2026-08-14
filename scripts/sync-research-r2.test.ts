import { describe, expect, it } from "vitest";
import { researchObjectKeys } from "./sync-research-r2";

describe("researchObjectKeys", () => {
  it("namespaces kernel artifacts under research/", () => {
    expect(researchObjectKeys.index).toBe("research/index.json");
    expect(researchObjectKeys.manifest).toBe("research/manifest.json");
    expect(researchObjectKeys.page("abc")).toBe("research/pages/abc.json");
  });
});
