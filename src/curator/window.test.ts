import { describe, expect, it } from "vitest";
import { nameStatusFromCompareFiles, resolveStartSha, seedShaFromRecentCommits } from "./window";

describe("nameStatusFromCompareFiles", () => {
  it("keeps page JSON adds, edits, and deletes", () => {
    expect(
      nameStatusFromCompareFiles([
        { filename: "pages/page_a.json", status: "added" },
        { filename: "pages/page_b.json", status: "modified" },
        { filename: "pages/page_c.json", status: "removed" },
        { filename: "manifest.json", status: "modified" },
      ]),
    ).toBe("A\tpages/page_a.json\nM\tpages/page_b.json\nD\tpages/page_c.json");
  });
});

describe("seedShaFromRecentCommits", () => {
  it("uses the parent of the oldest recent page commit", () => {
    expect(
      seedShaFromRecentCommits([
        { sha: "new", parents: ["mid"] },
        { sha: "old", parents: ["before"] },
      ]),
    ).toBe("before");
  });

  it("returns undefined when nothing recent changed", () => {
    expect(seedShaFromRecentCommits([])).toBeUndefined();
  });
});

describe("resolveStartSha", () => {
  it("keeps an existing processed SHA", () => {
    expect(resolveStartSha("sha0", "head", [{ sha: "new", parents: ["before"] }])).toEqual({
      sha: "sha0",
      skip: false,
    });
  });

  it("seeds at HEAD and skips when there is no recent work", () => {
    expect(resolveStartSha(undefined, "head", [])).toEqual({ sha: "head", skip: true });
  });

  it("starts from the parent of recent page commits so captures are not skipped", () => {
    expect(resolveStartSha(undefined, "head", [{ sha: "new", parents: ["before"] }])).toEqual({
      sha: "before",
      skip: false,
    });
  });
});
