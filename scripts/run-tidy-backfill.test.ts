import { describe, expect, it } from "vitest";
import { parseTidyBackfillArgs } from "./run-tidy-backfill";

describe("parseTidyBackfillArgs", () => {
  it("defaults to committing model batches of five", () => {
    expect(parseTidyBackfillArgs(["--data-dir", "data-repo"])).toEqual({
      dataDir: "data-repo",
      commit: true,
      stampOnly: false,
    });
  });

  it("accepts stamp-only, no-commit, and retry flags", () => {
    expect(parseTidyBackfillArgs(["--stamp-only", "--no-commit", "--no-retry", "--batch-size", "5"])).toEqual({
      batchSize: 5,
      commit: false,
      stampOnly: true,
      retryIds: [],
    });
  });
});
