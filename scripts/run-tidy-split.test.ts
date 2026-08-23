import { describe, expect, it } from "vitest";
import { mergeTidyIds, parseTidySplitArgs, untidiedIds } from "./run-tidy-split";

describe("parseTidySplitArgs", () => {
  it("requires a data directory and defaults the leftover reason", () => {
    expect(parseTidySplitArgs(["--data-dir", "data-repo"])).toEqual({
      dataDir: "data-repo",
      reason: "model returned no valid tidy proposal",
      maxChars: 8000,
    });
    expect(parseTidySplitArgs(["--data-dir", "data-repo", "--max-chars", "4000", "--reason", "x"])).toEqual({
      dataDir: "data-repo",
      reason: "x",
      maxChars: 4000,
    });
  });

  it("rejects a missing data directory", () => {
    expect(() => parseTidySplitArgs([])).toThrow("--data-dir is required");
  });

  it("keeps earlier split ids when the leftover list is scanned again", () => {
    expect(mergeTidyIds(["old-a", "old-b"], ["old-b", "new-c"])).toEqual(["old-a", "old-b", "new-c"]);
  });

  it("drops notes already marked tidied so a resume does not pay for them again", () => {
    expect(untidiedIds(["a", "b", "c"], { a: "2026-08-23T00:00:00.000Z" })).toEqual(["b", "c"]);
  });
});
