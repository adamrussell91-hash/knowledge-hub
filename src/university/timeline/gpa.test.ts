import { describe, expect, it } from "vitest";
import { formatGpa, summariseGpa } from "./gpa";
import type { DegreeRecord, UnitRecord } from "./types";

function unit(partial: Partial<UnitRecord> & Pick<UnitRecord, "id" | "title">): UnitRecord {
  return {
    code: null,
    status: "completed",
    start: null,
    end: null,
    gpaPoints: null,
    grade: null,
    description: null,
    assessments: [],
    ...partial,
  };
}

function degree(title: string, units: UnitRecord[]): DegreeRecord {
  return {
    id: title,
    title,
    institution: "UoN",
    status: "completed",
    start: "2009-02-01",
    end: "2013-12-01",
    description: null,
    units,
  };
}

describe("summariseGpa", () => {
  it("averages completed unit points on a 7-point scale and skips withdrawn units", () => {
    const summary = summariseGpa([
      degree("Arts", [
        unit({ id: "hd", title: "HD unit", gpaPoints: 7, grade: "High Distinction" }),
        unit({ id: "p", title: "Pass unit", gpaPoints: 4, grade: "Pass" }),
        unit({ id: "up", title: "Ungraded", gpaPoints: 4, grade: "Ungraded Pass" }),
        unit({ id: "w", title: "Dropped", gpaPoints: 6, grade: "Distinction", status: "withdrawn" }),
      ]),
    ]);
    expect(summary.scale).toBe(7);
    expect(summary.overall).toBe(5.5);
    expect(summary.gradedCount).toBe(2);
    expect(summary.ungradedCount).toBe(1);
    expect(summary.withdrawnCount).toBe(1);
    expect(formatGpa(summary.overall)).toBe("5.5");
  });

  it("can fold ungraded passes into the mean", () => {
    const summary = summariseGpa(
      [
        degree("Arts", [
          unit({ id: "hd", title: "HD", gpaPoints: 7, grade: "High Distinction" }),
          unit({ id: "up", title: "UP", gpaPoints: 4, grade: "Ungraded Pass" }),
        ]),
      ],
      true,
    );
    expect(summary.overall).toBe(5.5);
    expect(summary.gradedCount).toBe(2);
  });

  it("reports a GPA per degree", () => {
    const summary = summariseGpa([
      degree("A", [unit({ id: "a", title: "A", gpaPoints: 7, grade: "High Distinction" })]),
      degree("B", [unit({ id: "b", title: "B", gpaPoints: 5, grade: "Credit" })]),
    ]);
    expect(summary.degrees.map(row => row.gpa)).toEqual([7, 5]);
  });
});
