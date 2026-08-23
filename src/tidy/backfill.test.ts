import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { runTidyBackfill, STUCK_TIDY_RETRY_IDS } from "./backfill";
import type { TidyState } from "./run";

const page = (id: string, overrides: Partial<Page> = {}): Page => ({
  id, title: id, area: "notes", tags: [], body: "Clean note.", connected: [], attachments: [], source: "hub",
  created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-10T00:00:00.000Z", schema_version: 1, ...overrides,
});

describe("runTidyBackfill", () => {
  it("snapshots eligible ids, stamps clean tagged notes, and models the rest in batches of five", async () => {
    const pages = [
      ...Array.from({ length: 3 }, (_, i) => page(`stamp${i}`, { tags: ["Philosophy Knowledge and Society"] })),
      ...Array.from({ length: 7 }, (_, i) => page(`model${i}`, { tags: [], body: "Messy\n\n\n\ntext" })),
    ];
    const proposed: string[] = [];
    const commits: Array<{ selected: string[]; stamped: string[]; errors: string[] }> = [];
    let state: TidyState = { tidied: {} };
    const result = await runTidyBackfill({
      listPageIds: async () => pages.map(item => item.id),
      readPage: async id => pages.find(item => item.id === id) ?? null,
      writePage: async () => {},
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async next => { state = next; },
      propose: async p => {
        proposed.push(p.id);
        return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null };
      },
      now: () => "2026-08-12T00:00:00.000Z",
      random: () => 0,
      batchSize: 5,
      retryIds: [],
      commitBatch: async batch => { commits.push({ selected: batch.selected, stamped: batch.stamped, errors: batch.errors }); },
      writeSkipList: async () => {},
    });
    expect(proposed).toEqual(["model0", "model1", "model2", "model3", "model4", "model5", "model6"]);
    expect(commits.map(batch => ({ selected: batch.selected, stamped: batch.stamped }))).toEqual([
      { selected: [], stamped: ["stamp0", "stamp1", "stamp2"] },
      { selected: ["model0", "model1", "model2", "model3", "model4"], stamped: [] },
      { selected: ["model5", "model6"], stamped: [] },
    ]);
    expect(result.skips).toEqual([]);
  });

  it("continues after a model failure and writes that id to the skip list", async () => {
    const pages = [page("bad"), page("good")];
    let state: TidyState = { tidied: {} };
    let skips: Array<{ id: string; reason: string }> = [];
    const commits: number[] = [];
    await runTidyBackfill({
      listPageIds: async () => pages.map(item => item.id),
      readPage: async id => pages.find(item => item.id === id) ?? null,
      writePage: async () => {},
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async next => { state = next; },
      propose: async p => {
        if (p.id === "bad") throw new Error("model failed");
        return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null };
      },
      now: () => "2026-08-12T00:00:00.000Z",
      random: () => 0,
      batchSize: 5,
      retryIds: [],
      commitBatch: async () => { commits.push(1); },
      writeSkipList: async next => { skips = next; },
    });
    expect(commits).toHaveLength(1);
    expect(skips).toEqual([{ id: "bad", reason: "model failed" }]);
    expect(state.tidied).toMatchObject({ good: "2026-08-12T00:00:00.000Z" });
  });

  it("retries the stuck ids once after the main pass, even during cooldown", async () => {
    const stuck = STUCK_TIDY_RETRY_IDS[0]!;
    const pages = [page(stuck), page("later")];
    const proposed: string[] = [];
    let state: TidyState = {
      tidied: {},
      failures: { [stuck]: { at: "2026-08-11T00:00:00.000Z", reason: "model returned no valid tidy proposal", attempts: 2 } },
    };
    await runTidyBackfill({
      listPageIds: async () => pages.map(item => item.id),
      readPage: async id => pages.find(item => item.id === id) ?? null,
      writePage: async () => {},
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async next => { state = next; },
      propose: async p => {
        proposed.push(p.id);
        return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null };
      },
      now: () => "2026-08-12T00:00:00.000Z",
      random: () => 0,
      batchSize: 5,
      commitBatch: async () => {},
      writeSkipList: async () => {},
    });
    expect(proposed).toEqual(["later", stuck]);
  });
});
