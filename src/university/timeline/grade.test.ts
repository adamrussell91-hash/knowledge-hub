import { describe, expect, it } from "vitest";
import { resolveAssessmentGrade } from "./grade";
import type { AssessmentRecord, UnitRecord } from "./types";

const unit: UnitRecord = {
  id: "unit",
  title: "EDST5448 - Educational Research",
  code: "EDST5448",
  status: "completed",
  start: "2025-02-10",
  end: "2025-11-27",
  gpaPoints: 7,
  grade: "High Distinction",
  description: null,
  assessments: [],
};

function assessment(partial: Partial<AssessmentRecord>): AssessmentRecord {
  return {
    id: "a",
    title: "Assessment 1: Online quiz",
    kind: "test",
    status: "completed",
    start: "2025-10-17",
    end: null,
    gpaPoints: null,
    grade: null,
    description: null,
    unitNumber: "EDST5448",
    ...partial,
  };
}

describe("resolveAssessmentGrade", () => {
  it("prefers the assessment’s own grade", () => {
    expect(resolveAssessmentGrade(assessment({ grade: "Distinction", gpaPoints: 6 }), unit)).toEqual({
      grade: "Distinction",
      points: 6,
      source: "assessment",
    });
  });

  it("falls back to the unit grade when the assessment has none", () => {
    expect(resolveAssessmentGrade(assessment({}), unit)).toEqual({
      grade: "High Distinction",
      points: 7,
      source: "unit",
    });
  });
});
