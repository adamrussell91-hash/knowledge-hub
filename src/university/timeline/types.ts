export type StudyStatus = "completed" | "in-progress" | "withdrawn";

export type AssessmentKind = "assessment" | "test";

export type DatedSpan = {
  start: string | null;
  end: string | null;
};

export type AssessmentRecord = {
  id: string;
  title: string;
  kind: AssessmentKind;
  status: StudyStatus;
  start: string | null;
  end: string | null;
  gpaPoints: number | null;
  grade: string | null;
  description: string | null;
  unitNumber: string | null;
};

export type UnitRecord = {
  id: string;
  title: string;
  code: string | null;
  status: StudyStatus;
  start: string | null;
  end: string | null;
  gpaPoints: number | null;
  grade: string | null;
  description: string | null;
  assessments: AssessmentRecord[];
};

export type DegreeRecord = {
  id: string;
  title: string;
  institution: string | null;
  status: StudyStatus;
  start: string | null;
  end: string | null;
  description: string | null;
  units: UnitRecord[];
};

export type UniversityCatalogue = {
  generated: string;
  degrees: DegreeRecord[];
};

export type ZoomLayer = "degrees" | "units" | "assessments";

export type TimelineCamera = {
  startMs: number;
  endMs: number;
};

export type GpaRow = {
  id: string;
  label: string;
  grade: string | null;
  points: number;
  ungraded: boolean;
  withdrawn: boolean;
};

export type DegreeGpa = {
  id: string;
  title: string;
  gpa: number | null;
  gradedCount: number;
  ungradedCount: number;
  withdrawnCount: number;
};

export type GpaSummary = {
  scale: 7;
  overall: number | null;
  gradedCount: number;
  ungradedCount: number;
  withdrawnCount: number;
  includeUngraded: boolean;
  degrees: DegreeGpa[];
  rows: GpaRow[];
};
