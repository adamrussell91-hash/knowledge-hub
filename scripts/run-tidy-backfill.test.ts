import { describe, expect, it } from "vitest";
import {
  assertCleanStatus,
  backfillBatchMessage,
  costProjection,
  parseBackfillArgs,
  serializeSkipList,
} from "./run-tidy-backfill";

describe("parseBackfillArgs", () => {
  it("requires an explicit data repo and a bounded pilot or full-run acknowledgement", () => {
    expect(parseBackfillArgs(["--data-dir", "/tmp/data", "--model-limit", "100"]))
      .toEqual({ dataDir: "/tmp/data", batchSize: 5, modelLimit: 100 });
    expect(parseBackfillArgs(["--data-dir", "/tmp/data", "--full", "--batch-size", "10"]))
      .toEqual({ dataDir: "/tmp/data", batchSize: 10 });
    expect(() => parseBackfillArgs(["--model-limit", "100"])).toThrow("--data-dir");
    expect(() => parseBackfillArgs(["--data-dir", "/tmp/data"])).toThrow("--model-limit or --full");
    expect(() => parseBackfillArgs(["--data-dir", "/tmp/data", "--full", "--model-limit", "100"])).toThrow("not both");
  });

  it("rejects unsafe batch sizes and model limits", () => {
    expect(() => parseBackfillArgs(["--data-dir", "/tmp/data", "--model-limit", "0"])).toThrow("positive integer");
    expect(() => parseBackfillArgs(["--data-dir", "/tmp/data", "--full", "--batch-size", "11"])).toThrow("1 to 10");
  });
});

describe("data repository boundaries", () => {
  it("rejects a dirty checkout before it can stage data", () => {
    expect(() => assertCleanStatus(" M pages/p.json\n")).toThrow("must be clean");
    expect(() => assertCleanStatus("")).not.toThrow();
  });

  it("numbers batch commits and serializes only id and reason", () => {
    expect(backfillBatchMessage(7)).toBe("Tidy archive notes (backfill batch 7).");
    expect(JSON.parse(serializeSkipList([{ id: "bad", reason: "invalid proposal", ignored: true } as never])))
      .toEqual([{ id: "bad", reason: "invalid proposal" }]);
  });
});

describe("costProjection", () => {
  it("projects remaining input and output cost from actual pilot usage", () => {
    const projection = costProjection({
      attempted: 100,
      remainingModelEligible: 200,
      inputTokens: 100_000,
      outputTokens: 20_000,
      pilotCostUsd: 0.2,
      pageCostSamplesUsd: Array.from({ length: 100 }, (_, index) => index < 50 ? 0.001 : 0.003),
    });
    expect(projection).toMatchObject({
      projectedRemainingInputTokens: 200_000,
      projectedRemainingOutputTokens: 40_000,
      projectedRemainingCostUsd: 0.4,
      lowTotalCostUsd: 0.4,
      highTotalCostUsd: 0.8,
    });
    expect(projection.projectedTotalCostUsd).toBeCloseTo(0.6);
  });
});
