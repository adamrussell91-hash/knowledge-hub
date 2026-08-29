import { pointsForUnit } from "./gpa";
import type { AssessmentRecord, UnitRecord } from "./types";

export type ResolvedGrade = {
  grade: string | null;
  points: number | null;
  source: "assessment" | "unit" | null;
};

export function resolveAssessmentGrade(assessment: AssessmentRecord, unit: UnitRecord): ResolvedGrade {
  if (assessment.grade || assessment.gpaPoints != null) {
    return {
      grade: assessment.grade,
      points: assessment.gpaPoints,
      source: "assessment",
    };
  }
  const points = pointsForUnit(unit);
  if (unit.grade || points != null) {
    return { grade: unit.grade, points, source: "unit" };
  }
  return { grade: null, points: null, source: null };
}
