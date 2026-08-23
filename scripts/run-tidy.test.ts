import { describe, expect, it } from "vitest";
import { applySkipRetryResults, assertNoTidyErrors, isAnthropicCreditReason, parseTidyArgs, selectSkipRetryIds } from "./run-tidy";

describe("parseTidyArgs", () => {
  it("accepts id, scan count, and data directory flags", () => {
    expect(parseTidyArgs(["--scan", "--count", "99", "--data-dir", "data-repo"])).toEqual({ scan: true, count: 99, dataDir: "data-repo" });
    expect(parseTidyArgs(["--scan", "--data-dir", "data-repo"])).toEqual({ scan: true, count: 1, dataDir: "data-repo" });
    expect(parseTidyArgs(["--id", "page_1"])).toEqual({ id: "page_1" });
    expect(parseTidyArgs(["--from-skip-list", "--reason", "Anthropic error 400", "--limit", "10", "--data-dir", "data-repo"])).toEqual({
      fromSkipList: true,
      skipReason: "Anthropic error 400",
      limit: 10,
      dataDir: "data-repo",
    });
  });

  it("rejects a missing scan/id mode and invalid values", () => {
    expect(() => parseTidyArgs([])).toThrow("Use --id, --scan, or --from-skip-list");
    expect(() => parseTidyArgs(["--scan", "--count", "nope"])).toThrow("--count");
  });

  it("selects skip-list IDs by exact reason and removes successes", () => {
    const skips = [
      { id: "a", reason: "Anthropic error 400" },
      { id: "b", reason: "model returned no valid tidy proposal" },
      { id: "c", reason: "Anthropic error 400" },
      { id: "d", reason: "Anthropic error 400" },
    ];
    expect(selectSkipRetryIds(skips, "Anthropic error 400", 2)).toEqual(["a", "c"]);
    expect(applySkipRetryResults(skips, [{ id: "a" }, { id: "c", reason: "Anthropic error 400: credit balance is too low" }])).toEqual([
      { id: "b", reason: "model returned no valid tidy proposal" },
      { id: "c", reason: "Anthropic error 400: credit balance is too low" },
      { id: "d", reason: "Anthropic error 400" },
    ]);
    expect(isAnthropicCreditReason("Anthropic error 400: Your credit balance is too low to access the Anthropic API.")).toBe(true);
    expect(isAnthropicCreditReason("Anthropic error 400: prompt is too long")).toBe(false);
  });

  it("fails an explicit --id tidy, but lets a scan persist failures and commit", () => {
    expect(() => assertNoTidyErrors({ errors: ["p: model failed"] })).toThrow("p: model failed");
    expect(() => assertNoTidyErrors({ errors: ["p: model failed"] }, "scan")).not.toThrow();
    expect(() => assertNoTidyErrors({ errors: [] })).not.toThrow();
  });
});
