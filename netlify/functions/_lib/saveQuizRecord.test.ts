import { describe, expect, it } from "vitest";
import { saveQuizRecord } from "./saveQuizRecord";
import type { QuizItem } from "../../../src/quiz/schema";

const item: QuizItem = {
  id: "item_a",
  page_id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  area: "notes",
  tags: [],
  kind: "qa",
  cue: "cue",
  answer: "ans",
  harvested_at: "2024-01-01T00:00:00.000Z",
  source_updated_at: "2024-01-01T00:00:00.000Z",
  fsrs: {
    due: "2024-01-01T00:00:00.000Z",
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state: 1,
    learning_steps: 0,
  },
  status: "untested",
};

describe("saveQuizRecord", () => {
  it("writes schedule and merges items by page", async () => {
    const files = new Map<string, { sha: string; text: string }>();
    files.set("quiz/items/page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json", {
      sha: "1",
      text: JSON.stringify({ items: [{ ...item, answer: "old" }] }),
    });
    const fns = {
      getContent: async (file: string) => files.get(file) ?? null,
      putContent: async (file: string, text: string) => {
        files.set(file, { sha: "2", text });
      },
    };
    await saveQuizRecord(
      {
        schedule: [
          {
            id: item.id,
            page_id: item.page_id,
            area: item.area,
            tags: [],
            kind: "qa",
            cue_preview: "cue",
            due: item.fsrs.due,
            status: "untested",
            reps: 1,
            lapses: 0,
          },
        ],
        items: [{ ...item, answer: "new" }],
      },
      fns,
    );
    const schedule = JSON.parse(files.get("quiz/schedule.json")!.text);
    expect(schedule.schedule).toHaveLength(1);
    const stored = JSON.parse(files.get("quiz/items/page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json")!.text);
    expect(stored.items[0].answer).toBe("new");
  });

  it("persists edges and dumps and keeps them when a later save omits them", async () => {
    const files = new Map<string, { sha: string; text: string }>();
    const fns = {
      getContent: async (file: string) => files.get(file) ?? null,
      putContent: async (file: string, text: string) => {
        files.set(file, { sha: "2", text });
      },
    };
    await saveQuizRecord(
      {
        schedule: [],
        items: [],
        edges: [{ from: "a", to: "b", page_id: "page_hub_dump_x" }],
        dumps: [{ topic: "X", page_id: "page_hub_dump_x", nodes: [], edges: [], saved_at: "1" }],
      },
      fns,
    );
    await saveQuizRecord({ schedule: [], items: [] }, fns);
    const stored = JSON.parse(files.get("quiz/schedule.json")!.text);
    expect(stored.edges).toHaveLength(1);
    expect(stored.dumps).toHaveLength(1);
  });
});
