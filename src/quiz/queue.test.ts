import { describe, expect, it } from "vitest";
import type { QuizScheduleEntry } from "./schema";
import { buildSprintQueue, cardCapForDuration } from "./queue";

function entry(overrides: Partial<QuizScheduleEntry> & Pick<QuizScheduleEntry, "id">): QuizScheduleEntry {
  return {
    page_id: "p1",
    area: "notes",
    tags: ["memory"],
    kind: "qa",
    cue_preview: "cue",
    due: new Date(Date.now() - 1000).toISOString(),
    status: "untested",
    reps: 0,
    lapses: 0,
    ...overrides,
  };
}

describe("buildSprintQueue", () => {
  it("maps session length to card caps", () => {
    expect(cardCapForDuration(5)).toBe(8);
    expect(cardCapForDuration(15)).toBe(20);
    expect(cardCapForDuration(30)).toBe(36);
  });

  it("takes due items first, oldest due first, then untested", () => {
    const older = entry({ id: "a", due: "2020-01-01T00:00:00.000Z", reps: 2, status: "decaying" });
    const newerDue = entry({ id: "b", due: "2021-01-01T00:00:00.000Z", reps: 1, status: "verified" });
    const untested = entry({
      id: "c",
      due: new Date(Date.now() + 86400000).toISOString(),
      status: "untested",
      reps: 0,
    });
    const future = entry({
      id: "d",
      due: new Date(Date.now() + 86400000).toISOString(),
      status: "verified",
      reps: 4,
    });
    expect(buildSprintQueue([future, untested, newerDue, older], { durationMinutes: 5 }).map(item => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters by area and tags", () => {
    const notes = entry({ id: "n", area: "notes", tags: ["memory"] });
    const uni = entry({ id: "u", area: "university", tags: ["memory"] });
    const other = entry({ id: "o", area: "notes", tags: ["poetry"] });
    expect(
      buildSprintQueue([notes, uni, other], { durationMinutes: 15, area: "notes", tags: ["memory"] }).map(item => item.id),
    ).toEqual(["n"]);
  });

  it("cram ignores due dates and shuffles within cap", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      entry({
        id: `i${i}`,
        due: new Date(Date.now() + 86400000).toISOString(),
        status: "verified",
        reps: 3,
      }),
    );
    const queue = buildSprintQueue(items, { durationMinutes: 5, cram: true, random: () => 0.9 });
    expect(queue).toHaveLength(8);
  });

  it("can restrict the queue to HQE Q/A items", () => {
    const qa = entry({ id: "q", kind: "qa" });
    const def = entry({ id: "d", kind: "definition" });
    expect(buildSprintQueue([qa, def], { durationMinutes: 15, kinds: ["qa"] }).map(item => item.id)).toEqual(["q"]);
  });

  it("keeps Why/How cues when that drill is on", () => {
    const why = entry({ id: "w", cue_preview: "Why space reviews?" });
    const how = entry({ id: "h", cue_preview: "How does retrieval work?" });
    const what = entry({ id: "t", cue_preview: "What is a schema?" });
    expect(
      buildSprintQueue([why, how, what], { durationMinutes: 15, whyHow: true }).map(item => item.id),
    ).toEqual(["w", "h"]);
  });

  it("interleaves kinds so an exam mix does not block by type", () => {
    const items = [
      entry({ id: "q1", kind: "qa" }),
      entry({ id: "q2", kind: "qa" }),
      entry({ id: "d1", kind: "definition" }),
      entry({ id: "d2", kind: "definition" }),
      entry({ id: "c1", kind: "cloze" }),
      entry({ id: "c2", kind: "cloze" }),
    ];
    const kinds = buildSprintQueue(items, {
      durationMinutes: 5,
      cram: true,
      interleave: true,
      random: () => 0,
    }).map(item => item.kind);
    expect(kinds).toHaveLength(6);
    for (let i = 1; i < kinds.length; i++) {
      expect(kinds[i]).not.toBe(kinds[i - 1]);
    }
  });
});
