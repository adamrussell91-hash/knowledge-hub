import { describe, expect, it } from "vitest";
import type { QuizScheduleEntry } from "./schema";
import { connectionBoard, filterSchedule, groupByStatus, statusTone } from "./statusGraph";

function entry(overrides: Partial<QuizScheduleEntry> & Pick<QuizScheduleEntry, "id" | "status">): QuizScheduleEntry {
  return {
    page_id: "p1",
    area: "notes",
    tags: ["memory"],
    kind: "qa",
    cue_preview: "cue",
    due: "2024-01-01T00:00:00.000Z",
    reps: 0,
    lapses: 0,
    ...overrides,
  };
}

describe("statusTone", () => {
  it("maps verified to black, untested to blue, decaying and failed to orange", () => {
    expect(statusTone("verified")).toBe("black");
    expect(statusTone("untested")).toBe("blue");
    expect(statusTone("decaying")).toBe("orange");
    expect(statusTone("failed")).toBe("orange");
  });
});

describe("filterSchedule", () => {
  it("filters by area and tags", () => {
    const rows = [
      entry({ id: "a", status: "untested", area: "notes", tags: ["memory"] }),
      entry({ id: "b", status: "verified", area: "university", tags: ["memory"] }),
      entry({ id: "c", status: "failed", area: "notes", tags: ["poetry"] }),
    ];
    expect(filterSchedule(rows, { area: "notes", tags: ["memory"] }).map(row => row.id)).toEqual(["a"]);
  });
});

describe("groupByStatus", () => {
  it("keeps empty buckets so the map always has four clusters", () => {
    const grouped = groupByStatus([entry({ id: "a", status: "verified" })]);
    expect(grouped.untested).toEqual([]);
    expect(grouped.decaying).toEqual([]);
    expect(grouped.failed).toEqual([]);
    expect(grouped.verified.map(row => row.id)).toEqual(["a"]);
  });
});

describe("connectionBoard", () => {
  it("keeps saved positions and drops edges whose ends are out of scope", () => {
    const known = entry({ id: "k", status: "verified", x: 20, y: 30, kind: "known" });
    const gap = entry({ id: "g", status: "untested", x: 70, y: 40, kind: "gap" });
    const other = entry({ id: "o", status: "failed" });
    const board = connectionBoard([known, gap], [
      { from: "k", to: "g", page_id: "p1" },
      { from: "k", to: "o", page_id: "p1" },
    ]);
    expect(board.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, tone: node.tone }))).toEqual([
      { id: "k", x: 20, y: 30, tone: "black" },
      { id: "g", x: 70, y: 40, tone: "blue" },
    ]);
    expect(board.edges).toEqual([{ from: "k", to: "g", page_id: "p1" }]);
  });
});
