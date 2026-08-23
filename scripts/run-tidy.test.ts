import { describe, expect, it } from "vitest";
import { assertNoTidyErrors, parseTidyArgs } from "./run-tidy";

describe("parseTidyArgs", () => {
  it("accepts id, scan count, and data directory flags", () => {
    expect(parseTidyArgs(["--scan", "--count", "99", "--data-dir", "data-repo"])).toEqual({ scan: true, count: 99, dataDir: "data-repo" });
    expect(parseTidyArgs(["--scan", "--data-dir", "data-repo"])).toEqual({ scan: true, count: 1, dataDir: "data-repo" });
    expect(parseTidyArgs(["--id", "page_1"])).toEqual({ id: "page_1" });
  });

  it("rejects a missing scan/id mode and invalid values", () => {
    expect(() => parseTidyArgs([])).toThrow("Use --id or --scan");
    expect(() => parseTidyArgs(["--scan", "--count", "nope"])).toThrow("--count");
  });

  it("turns persisted per-note failures into a CLI failure", () => {
    expect(() => assertNoTidyErrors({ errors: ["p: model failed"] })).toThrow("p: model failed");
    expect(() => assertNoTidyErrors({ errors: [] })).not.toThrow();
  });
});
