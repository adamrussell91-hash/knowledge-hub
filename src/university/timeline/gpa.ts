import type { DegreeRecord, GpaSummary, StudyStatus, UnitRecord } from "./types";

export const GPA_SCALE = 7;

export const GRADE_POINTS: Record<string, number> = {
  "high distinction": 7,
  distinction: 6,
  credit: 5,
  pass: 4,
  "ungraded pass": 4,
  fail: 0,
};

export function isUngraded(grade: string | null) {
  return (grade ?? "").toLowerCase() === "ungraded pass";
}

export function pointsForUnit(unit: UnitRecord): number | null {
  if (unit.gpaPoints != null) return unit.gpaPoints;
  if (!unit.grade) return null;
  return GRADE_POINTS[unit.grade.toLowerCase()] ?? null;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

export function formatGpa(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function statusLabel(status: StudyStatus) {
  if (status === "in-progress") return "In progress";
  if (status === "withdrawn") return "Withdrawn";
  return "Completed";
}

export function summariseGpa(degrees: DegreeRecord[], includeUngraded = false): GpaSummary {
  const rows = degrees.flatMap(degree =>
    degree.units.map(unit => {
      const points = pointsForUnit(unit);
      return {
        id: unit.id,
        label: unit.code ? `${unit.code} · ${degree.title}` : `${unit.title} · ${degree.title}`,
        grade: unit.grade,
        points: points ?? 0,
        ungraded: isUngraded(unit.grade),
        withdrawn: unit.status === "withdrawn" || degree.status === "withdrawn",
        countedPoints: points,
        degreeId: degree.id,
        degreeTitle: degree.title,
      };
    }),
  );

  const eligible = rows.filter(row => {
    if (row.withdrawn || row.countedPoints == null) return false;
    if (row.ungraded && !includeUngraded) return false;
    return true;
  });

  const byDegree = new Map<string, { title: string; points: number[] }>();
  for (const degree of degrees) {
    byDegree.set(degree.id, { title: degree.title, points: [] });
  }
  for (const row of eligible) {
    byDegree.get(row.degreeId)?.points.push(row.countedPoints!);
  }

  return {
    scale: GPA_SCALE,
    overall: mean(eligible.map(row => row.countedPoints!)),
    gradedCount: eligible.length,
    ungradedCount: rows.filter(row => row.ungraded && !row.withdrawn).length,
    withdrawnCount: rows.filter(row => row.withdrawn).length,
    includeUngraded,
    degrees: [...byDegree.entries()].map(([id, value]) => ({
      id,
      title: value.title,
      gpa: mean(value.points),
      gradedCount: value.points.length,
      ungradedCount: rows.filter(row => row.degreeId === id && row.ungraded && !row.withdrawn).length,
      withdrawnCount: rows.filter(row => row.degreeId === id && row.withdrawn).length,
    })),
    rows: eligible.map(({ countedPoints: _c, degreeId: _d, degreeTitle: _t, ...row }) => row),
  };
}
