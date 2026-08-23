import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { excerptFromTidyBody, normalizeTidyState, runTidy, tidyOnePage } from "./run";

const page = (id: string, overrides: Partial<Page> = {}): Page => ({
  id, title: id, area: "notes", tags: ["Philosophy Knowledge and Society"], body: "Clean note.", connected: [], attachments: [], source: "hub",
  created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-10T00:00:00.000Z", schema_version: 1, ...overrides,
});

describe("runTidy", () => {
  it("caps scans at one, prioritising an untidied messy note", async () => {
    const pages = Array.from({ length: 25 }, (_, i) => page(`p${i}`, { body: i < 2 ? "Messy\n\n\n\ntext" : "Clean note." }));
    const called: string[] = [];
    await runTidy({
      scan: true, count: 100, readPage: async id => pages.find(p => p.id === id) ?? null, listPageIds: async () => pages.map(p => p.id),
      readManifest: async () => [], writeManifest: async () => {}, readState: async () => ({ tidied: { p2: "2026-08-11T00:00:00.000Z" } }), writeState: async () => {},
      propose: async p => { called.push(p.id); return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }; }, writePage: async () => {}, now: () => "2026-08-12T00:00:00.000Z", random: () => 0,
    });
    expect(called).toEqual(["p0"]);
    expect(called).not.toContain("p2");
  });

  it("stamps one clean canonical scan note without calling the model", async () => {
    let state: unknown = { tidied: {} };
    let calls = 0;
    const result = await runTidy({
      scan: true,
      count: 100,
      readPage: async id => page(id),
      listPageIds: async () => ["clean-a", "clean-b"],
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async value => { state = value; },
      propose: async () => { calls++; return null; },
      writePage: async () => {},
      now: () => "2026-08-12T00:00:00.000Z",
      random: () => 0,
    });
    expect(calls).toBe(0);
    expect(result.selected).toHaveLength(1);
    expect(result.stamped).toEqual(result.selected);
    expect(state).toMatchObject({ tidied: { [result.selected[0]!]: "2026-08-12T00:00:00.000Z" } });
  });

  it("does not write an unchanged page but records that it was tidied", async () => {
    const writes: Page[] = [];
    let state: unknown;
    await runTidy({ id: "p", readPage: async () => page("p"), listPageIds: async () => ["p"], readManifest: async () => [], writeManifest: async () => {}, readState: async () => ({ tidied: {} }), writeState: async value => { state = value; }, propose: async p => ({ tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }), writePage: async p => { writes.push(p); }, now: () => "2026-08-12T00:00:00.000Z" });
    expect(writes).toEqual([]);
    expect(state).toMatchObject({ lastRunAt: "2026-08-12T00:00:00.000Z", tidied: { p: "2026-08-12T00:00:00.000Z" } });
  });

  it("processes an explicitly requested clean page even when its scan state is current", async () => {
    let calls = 0;
    await runTidy({ id: "p", readPage: async () => page("p"), listPageIds: async () => ["p"], readManifest: async () => [], writeManifest: async () => {}, readState: async () => ({ tidied: { p: "2026-08-11T00:00:00.000Z" } }), writeState: async () => {}, propose: async p => { calls++; return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }; }, writePage: async () => {}, now: () => "2026-08-12T00:00:00.000Z" });
    expect(calls).toBe(1);
  });

  it("does not rewrite tag ordering or body spacing when their normalized meanings match", async () => {
    const writes: Page[] = [];
    await runTidy({ id: "p", readPage: async () => page("p", { tags: ["Philosophy Knowledge and Society", "Learning Science and Cognition"], body: "Text\n\nMore" }), listPageIds: async () => ["p"], readManifest: async () => [], writeManifest: async () => {}, readState: async () => ({ tidied: {} }), writeState: async () => {}, propose: async () => ({ tags: ["learning science and cognition", "philosophy knowledge and society"], body: "Text\n\n\n\nMore", title: null }), writePage: async p => { writes.push(p); }, now: () => "2026-08-12T00:00:00.000Z" });
    expect(writes).toEqual([]);
  });

  it("creates an excerpt without importing the indexing script", () => {
    expect(excerptFromTidyBody("# Heading\n\nA useful note.")).toBe("A useful note.");
  });

  it("strips bold markers and list dashes from the excerpt", () => {
    expect(excerptFromTidyBody("**Main Thesis:**\n\n- Information networks create order.")).toBe(
      "Main Thesis: Information networks create order.",
    );
  });

  it("writes a changed full page and its matching manifest entry", async () => {
    const writes: Page[] = [];
    let manifest: unknown;
    await runTidy({ id: "p", readPage: async () => page("p", { origins: [{ kind: "unit", label: "EDST5805" }] }), listPageIds: async () => ["p"], readManifest: async () => [{ id: "p", title: "p", area: "notes", tags: ["Philosophy Knowledge and Society"], excerpt: "Clean note.", origins: [{ kind: "unit", label: "EDST5805" }] }], writeManifest: async value => { manifest = value; }, readState: async () => ({ tidied: {} }), writeState: async () => {}, propose: async () => ({ tags: ["Philosophy Knowledge and Society"], body: "Changed body.", title: "New title" }), writePage: async p => { writes.push(p); }, now: () => "2026-08-12T00:00:00.000Z" });
    expect(writes[0]).toMatchObject({ title: "New title", tags: ["Philosophy Knowledge and Society"], body: "Changed body.", updated_at: "2026-08-12T00:00:00.000Z", origins: [{ kind: "unit", label: "EDST5805" }] });
    expect(manifest).toEqual([{ id: "p", title: "New title", area: "notes", tags: ["Philosophy Knowledge and Society"], excerpt: "Changed body.", origins: [{ kind: "unit", label: "EDST5805" }] }]);
  });

  it("persists successful progress when one note fails so the next scan resumes", async () => {
    const states: unknown[] = [];
    await runTidy({ scan: true, count: 2, readPage: async id => page(id), listPageIds: async () => ["bad", "good"], readManifest: async () => [], writeManifest: async () => {}, readState: async () => ({ tidied: {} }), writeState: async value => { states.push(value); }, propose: async p => { if (p.id === "bad") throw new Error("model failed"); return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }; }, writePage: async () => {}, now: () => "2026-08-12T00:00:00.000Z", random: () => 0 });
    expect(states.at(-1)).toMatchObject({ tidied: { good: "2026-08-12T00:00:00.000Z" } });
  });

  it("records a failed page and selects another page during its 72-hour cooldown", async () => {
    let state: unknown = { tidied: {} };
    const proposed: string[] = [];
    const base = {
      scan: true,
      count: 1,
      readPage: async (id: string) => page(id, { body: "Messy\n\n\n\ntext" }),
      listPageIds: async () => ["bad", "good"],
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async (value: unknown) => { state = value; },
      writePage: async () => {},
      random: () => 0,
    };

    const failed = await runTidy({
      ...base,
      propose: async p => { proposed.push(p.id); throw new Error("model failed"); },
      now: () => "2026-08-12T00:00:00.000Z",
    });
    expect(failed.errors).toEqual(["bad: model failed"]);
    expect(state).toMatchObject({
      failures: { bad: { attempts: 1, lastFailedAt: "2026-08-12T00:00:00.000Z", reason: "model failed" } },
    });

    const resumed = await runTidy({
      ...base,
      propose: async p => { proposed.push(p.id); return { tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }; },
      now: () => "2026-08-13T00:00:00.000Z",
    });
    expect(resumed.selected).toEqual(["good"]);
    expect(proposed).toEqual(["bad", "good"]);
  });

  it("lets an explicit id retry during cooldown and clears its failure after success", async () => {
    let state: unknown = {
      tidied: {},
      failures: { bad: { attempts: 2, lastFailedAt: "2026-08-12T00:00:00.000Z", reason: "model failed" } },
    };
    const result = await runTidy({
      id: "bad",
      readPage: async id => page(id),
      listPageIds: async () => ["bad"],
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async value => { state = value; },
      propose: async p => ({ tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }),
      writePage: async () => {},
      now: () => "2026-08-13T00:00:00.000Z",
    });
    expect(result.selected).toEqual(["bad"]);
    expect(state).toMatchObject({ tidied: { bad: "2026-08-13T00:00:00.000Z" }, failures: {} });
  });

  it("preserves a prior backfill marker when a later attempt also fails", async () => {
    let state: unknown = {
      tidied: {},
      failures: {
        bad: {
          attempts: 1,
          lastFailedAt: "2026-08-01T00:00:00.000Z",
          reason: "pilot failed",
          backfillAttemptedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    };
    await runTidy({
      scan: true,
      count: 1,
      readPage: async id => page(id, { body: "Messy\n\n\n\ntext" }),
      listPageIds: async () => ["bad"],
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => state,
      writeState: async value => { state = value; },
      propose: async () => { throw new Error("scheduled retry failed"); },
      writePage: async () => {},
      now: () => "2026-08-10T00:00:00.000Z",
    });
    expect(state).toMatchObject({
      failures: {
        bad: {
          attempts: 2,
          reason: "scheduled retry failed",
          backfillAttemptedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    });
  });

  it("sanitizes malformed tidy state before selecting pages", () => {
    expect(normalizeTidyState({
      lastRunAt: 3,
      tidied: { good: "2026-08-12T00:00:00.000Z", bad: 4 },
      failures: {
        valid: { attempts: 2, lastFailedAt: "2026-08-12T00:00:00.000Z", reason: "bad output", backfillAttemptedAt: "2026-08-12T01:00:00.000Z" },
        invalid: { attempts: "two", lastFailedAt: 4, reason: null },
      },
    })).toEqual({
      tidied: { good: "2026-08-12T00:00:00.000Z" },
      failures: { valid: { attempts: 2, lastFailedAt: "2026-08-12T00:00:00.000Z", reason: "bad output", backfillAttemptedAt: "2026-08-12T01:00:00.000Z" } },
    });
    expect(normalizeTidyState(null)).toEqual({ tidied: {} });
  });

  it("reports a missing direct page rather than silently advancing state", async () => {
    const states: unknown[] = [];
    const result = await runTidy({ id: "missing", readPage: async () => null, listPageIds: async () => [], readManifest: async () => [], writeManifest: async () => {}, readState: async () => ({ tidied: {} }), writeState: async state => { states.push(state); }, propose: async () => null, writePage: async () => {}, now: () => "2026-08-12T00:00:00.000Z" });
    expect(result.errors).toEqual(["missing: page was not found or is invalid"]);
    expect(states.at(-1)).toMatchObject({ tidied: {} });
  });

  it("upserts an absent manifest entry when it writes a page", async () => {
    let manifest: unknown;
    await runTidy({ id: "p", readPage: async () => page("p"), listPageIds: async () => ["p"], readManifest: async () => [], writeManifest: async entries => { manifest = entries; }, readState: async () => ({ tidied: {} }), writeState: async () => {}, propose: async () => ({ tags: ["Philosophy Knowledge and Society"], body: "Changed", title: null }), writePage: async () => {}, now: () => "2026-08-12T00:00:00.000Z" });
    expect(manifest).toEqual([expect.objectContaining({ id: "p", tags: ["Philosophy Knowledge and Society"], excerpt: "Changed" })]);
  });

  it("does not mark a page tidied when its manifest write fails", async () => {
    const states: unknown[] = [];
    const result = await runTidy({ id: "p", readPage: async () => page("p"), listPageIds: async () => ["p"], readManifest: async () => [], writeManifest: async () => { throw new Error("disk full"); }, readState: async () => ({ tidied: {} }), writeState: async state => { states.push(state); }, propose: async () => ({ tags: ["Philosophy Knowledge and Society"], body: "Changed", title: null }), writePage: async () => {}, now: () => "2026-08-12T00:00:00.000Z" });
    expect(result.errors).toEqual(["p: disk full"]);
    expect(states.at(-1)).toMatchObject({ tidied: {} });
  });

  it("restores the prior manifest when the page write fails after a manifest-first update", async () => {
    const original = [{ id: "p", title: "p", area: "notes" as const, tags: ["Philosophy Knowledge and Society"], excerpt: "Clean note." }];
    let persistedManifest = original;
    const writes: string[] = [];
    const result = await runTidy({ id: "p", readPage: async () => page("p"), listPageIds: async () => ["p"], readManifest: async () => persistedManifest, writeManifest: async entries => { writes.push("manifest"); persistedManifest = entries; }, readState: async () => ({ tidied: {} }), writeState: async () => {}, propose: async () => ({ tags: ["Philosophy Knowledge and Society"], body: "Changed", title: null }), writePage: async () => { writes.push("page"); throw new Error("page disk full"); }, now: () => "2026-08-12T00:00:00.000Z" });
    expect(result.errors).toEqual(["p: page disk full"]);
    expect(writes).toEqual(["manifest", "page", "manifest"]);
    expect(persistedManifest).toEqual(original);
  });
});

describe("tidyOnePage", () => {
  it("bumps updated_at on an unchanged note so the reader can see completion", async () => {
    const writes: Page[] = [];
    const result = await tidyOnePage("p", {
      readPage: async () => page("p"),
      listPageIds: async () => ["p"],
      readManifest: async () => [],
      writeManifest: async () => {},
      readState: async () => ({ tidied: {} }),
      writeState: async () => {},
      propose: async p => ({ tags: ["Philosophy Knowledge and Society"], body: p.body, title: null }),
      writePage: async next => { writes.push(next); },
      now: () => "2026-08-12T00:00:00.000Z",
    });
    expect(result.updated_at).toBe("2026-08-12T00:00:00.000Z");
    expect(writes).toEqual([expect.objectContaining({ id: "p", updated_at: "2026-08-12T00:00:00.000Z" })]);
  });
});
