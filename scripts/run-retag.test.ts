import { describe, expect, it } from "vitest";
import { parseRetagArgs } from "./run-retag";

describe("parseRetagArgs", () => {
  it("defaults to a full scan and accepts id and data directory flags", () => {
    expect(parseRetagArgs([])).toEqual({ scan: true });
    expect(parseRetagArgs(["--data-dir", "data-repo"])).toEqual({ scan: true, dataDir: "data-repo" });
    expect(parseRetagArgs(["--id", "page_1", "--data-dir", "data-repo"])).toEqual({ id: "page_1", dataDir: "data-repo" });
  });

  it("rejects combining --id with a scan", () => {
    expect(() => parseRetagArgs(["--id", "page_1", "--scan"])).toThrow("Use --id or --scan");
  });
});
