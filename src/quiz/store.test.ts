import { describe, expect, it } from "vitest";
import { mergeItemFile, mergeSchedule, replaceTopicEdges, upsertDump } from "./store";
import type { DumpSnapshot, QuizEdge, QuizItem, QuizScheduleEntry } from "./schema";

const item = (id: string, cue: string): QuizItem => ({
  id,
  page_id: "p1",
  area: "notes",
  tags: [],
  kind: "qa",
  cue,
  answer: "a",
  harvested_at: "2024-01-01T00:00:00.000Z",
  source_updated_at: "2024-01-01T00:00:00.000Z",
  fsrs: {
    due: "2024-01-01T00:00:00.000Z",
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    learning_steps: 0,
  },
  status: "untested",
});

describe("mergeItemFile", () => {
  it("replaces matching ids and keeps others", () => {
    const incoming = { ...item("a", "new cue"), answer: "updated" };
    const merged = mergeItemFile([item("a", "old"), item("b", "keep")], [incoming]);
    expect(merged.find(row => row.id === "a")?.answer).toBe("updated");
    expect(merged.find(row => row.id === "b")?.cue).toBe("keep");
  });
});

describe("mergeSchedule", () => {
  it("upserts by id", () => {
    const a: QuizScheduleEntry = {
      id: "a",
      page_id: "p1",
      area: "notes",
      tags: [],
      kind: "qa",
      cue_preview: "old",
      due: "2024-01-01T00:00:00.000Z",
      status: "untested",
      reps: 0,
      lapses: 0,
    };
    const next = mergeSchedule([a], [{ ...a, cue_preview: "new", reps: 2, status: "verified" }]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ cue_preview: "new", reps: 2, status: "verified" });
  });
});

describe("replaceTopicEdges", () => {
  it("replaces only edges for that dump page", () => {
    const keep: QuizEdge = { from: "a", to: "b", page_id: "page_other" };
    const old: QuizEdge = { from: "c", to: "d", page_id: "page_dump" };
    const next: QuizEdge = { from: "e", to: "f", page_id: "page_dump" };
    expect(replaceTopicEdges([keep, old], "page_dump", [next])).toEqual([keep, next]);
  });
});

describe("upsertDump", () => {
  it("replaces the snapshot for the same page id", () => {
    const first: DumpSnapshot = { topic: "A", page_id: "p", nodes: [], edges: [], saved_at: "1" };
    const second: DumpSnapshot = { topic: "A", page_id: "p", nodes: [], edges: [], saved_at: "2" };
    expect(upsertDump([first], second)).toEqual([second]);
  });
});
