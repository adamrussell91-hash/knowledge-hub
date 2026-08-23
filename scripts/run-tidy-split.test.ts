import { describe, expect, it } from "vitest";
import { parseTidySplitArgs } from "./run-tidy-split";

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
});
