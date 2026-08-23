import { describe, expect, it, vi } from "vitest";
import type { Page, PageManifestEntry } from "../src/domain/page";
import type { TidyIO, TidyState } from "../src/tidy/run";
import { KNOWN_STUCK_IDS, needsModelTidy, runTidyBackfill } from "./tidy-backfill";

const page = (id: string, overrides: Partial<Page> = {}): Page => ({
  id,
  title: id,
  area: "notes",
  tags: ["Philosophy Knowledge and Society"],
  body: "Clean note.",
  connected: [],
  attachments: [],
  source: "hub",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

function memoryIO(inputPages: Page[], propose: TidyIO["propose"], initialState: TidyState = { tidied: {} }) {
  let state: TidyState = initialState;
  let manifest: PageManifestEntry[] = [];
  const pages = new Map(inputPages.map(item => [item.id, item]));
  const io: Omit<TidyIO, "id" | "scan" | "count"> = {
    listPageIds: async () => [...pages.keys()],
    readPage: async id => pages.get(id) ?? null,
    writePage: async next => { pages.set(next.id, next); },
    readManifest: async () => manifest,
    writeManifest: async next => { manifest = next; },
    readState: async () => state,
    writeState: async next => { state = next; },
    propose,
    now: () => "2026-08-23T00:00:00.000Z",
  };
  return { io, readState: () => state };
}

describe("needsModelTidy", () => {
  it("only fast-paths clean pages with one to three canonical topic tags", () => {
    expect(needsModelTidy(page("clean"))).toBe(false);
    expect(needsModelTidy(page("three", { tags: [
      "Philosophy Knowledge and Society",
      "Learning Science and Cognition",
      "Research Methods and Evidence Literacy",
    ] }))).toBe(false);
    expect(needsModelTidy(page("messy", { body: "Messy\n\n\n\ntext" }))).toBe(true);
    expect(needsModelTidy(page("untagged", { tags: [] }))).toBe(true);
    expect(needsModelTidy(page("unknown", { tags: ["History"] }))).toBe(true);
  });
});

describe("runTidyBackfill", () => {
  it("stamps clean pages without a model call and continues after a failed model page", async () => {
    const propose = vi.fn(async (item: Page) => {
      if (item.id === "bad") throw new Error("toxic note");
      return { tags: ["Philosophy Knowledge and Society"], body: item.body, title: null };
    });
    const { io, readState } = memoryIO([
      page("clean"),
      page("bad", { tags: [] }),
      page("good", { tags: [] }),
    ], propose);
    const onPreflight = vi.fn(async () => {});
    const onBatch = vi.fn(async () => {});

    const summary = await runTidyBackfill({ io, batchSize: 5, usage: [], onPreflight, onBatch });

    expect(propose.mock.calls.map(([item]) => item.id)).toEqual(["bad", "good"]);
    expect(summary).toMatchObject({ stamped: 1, attempted: 2, succeeded: 1, failed: 1 });
    expect(summary.leftovers).toEqual([{ id: "bad", reason: "toxic note" }]);
    expect(readState().tidied).toHaveProperty("clean", "2026-08-23T00:00:00.000Z");
    expect(onPreflight).toHaveBeenCalledOnce();
    expect(onBatch).toHaveBeenCalledOnce();
  });

  it("stops after 100 model-eligible pages and prices actual tokens", async () => {
    const usage: Array<{ inputTokens: number; outputTokens: number }> = [];
    const pages = Array.from({ length: 106 }, (_, index) => index === 0
      ? page("clean")
      : page(`model-${index}`, { tags: [] }));
    const { io, readState } = memoryIO(pages, async item => {
      usage.push({ inputTokens: 100, outputTokens: 20 });
      return { tags: ["Philosophy Knowledge and Society"], body: item.body, title: null };
    });

    const summary = await runTidyBackfill({ io, batchSize: 5, modelLimit: 100, usage });

    expect(summary).toMatchObject({ stamped: 1, attempted: 100, succeeded: 100, remainingModelEligible: 5 });
    expect(summary.inputTokens).toBe(10_000);
    expect(summary.outputTokens).toBe(2_000);
    expect(summary.pilotCostUsd).toBe(0.02);
    expect(Object.keys(readState().tidied)).toHaveLength(101);
  });

  it("retries a known stuck id once after the main pass", async () => {
    const stuck = KNOWN_STUCK_IDS[0];
    let attempts = 0;
    const { io } = memoryIO([page(stuck, { tags: [] })], async item => {
      attempts++;
      if (attempts === 1) throw new Error("invalid proposal");
      return { tags: ["Philosophy Knowledge and Society"], body: item.body, title: null };
    });

    const summary = await runTidyBackfill({ io, usage: [] });

    expect(attempts).toBe(2);
    expect(summary.leftovers).toEqual([]);
    expect(summary.succeeded).toBe(1);
  });

  it("attempts a scheduled failure once but does not repeat a prior backfill failure", async () => {
    const propose = vi.fn(async (item: Page) => ({ tags: ["Philosophy Knowledge and Society"], body: item.body, title: null }));
    const { io } = memoryIO([
      page("scheduled-failure", { tags: [] }),
      page("backfill-failure", { tags: [] }),
    ], propose, {
      tidied: {},
      failures: {
        "scheduled-failure": { attempts: 1, lastFailedAt: "2026-08-22T00:00:00.000Z", reason: "scheduled model failed" },
        "backfill-failure": { attempts: 1, lastFailedAt: "2026-08-22T00:00:00.000Z", reason: "backfill model failed", backfillAttemptedAt: "2026-08-22T00:00:00.000Z" },
      },
    });

    const summary = await runTidyBackfill({ io, usage: [] });

    expect(propose.mock.calls.map(([item]) => item.id)).toEqual(["scheduled-failure"]);
    expect(summary.leftovers).toEqual([{ id: "backfill-failure", reason: "backfill model failed" }]);
  });
});
