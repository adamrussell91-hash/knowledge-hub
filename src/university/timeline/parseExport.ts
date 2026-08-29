import type {
  AssessmentKind,
  AssessmentRecord,
  DegreeRecord,
  StudyStatus,
  UnitRecord,
  UniversityCatalogue,
} from "./types";

const DEGREE_HEADING = /^## (\d+)\. (.+)$/;
const UNIT_HEADING = /^#### (\d+)\.(\d+) (.+)$/;
const ITEM_HEADING = /^###### (\d+)\.(\d+)\.(\d+) (.+)$/;
const TABLE_ROW = /^\| ([^|]+) \| (.+) \|$/;

const TITLE_OVERRIDES: Record<string, string> = {
  "Graduate Certificate in Child and Adolescent|Charles Sturt University":
    "Graduate Certificate in Child and Adolescent Welfare",
  "Graduate Certificate in Child and Adolescent|Victoria University":
    "Graduate Certificate in Child and Adolescent Mental Health",
  "Advanced Insights in Cognitive Psychology|Flinders University":
    "Master of Cognitive Psychology",
  "Transformational Leadership Certificate|University of Newcastle":
    "Graduate Certificate in Transformational Leadership",
};

const EXCLUDED_PROGRAMMES = new Set(["graduate diploma of psychology"]);

function slug(parts: string[]) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function blank(value: string | undefined) {
  const text = (value ?? "").trim();
  if (!text || text === "Not recorded") return null;
  return text;
}

function parseStatus(value: string | null): StudyStatus {
  const key = (value ?? "").toLowerCase();
  if (key === "in progress") return "in-progress";
  if (key === "withdrawn") return "withdrawn";
  return "completed";
}

function parseDates(value: string | null): { start: string | null; end: string | null } {
  if (!value) return { start: null, end: null };
  try {
    const parsed = JSON.parse(value) as { start?: string; end?: string };
    return { start: parsed.start ?? null, end: parsed.end ?? null };
  } catch {
    return { start: null, end: null };
  }
}

function parseGpa(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePlaceName(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { name?: string };
    return parsed.name?.replace(/-(Armidale|Kensington Campus|Footscray Park Campus)$/i, "") ?? null;
  } catch {
    return null;
  }
}

function unitCode(name: string, unitNumber: string | null): string | null {
  if (unitNumber && /^[A-Z]{2,}\d/.test(unitNumber)) {
    return unitNumber.split(/[:\s]/)[0] ?? unitNumber;
  }
  const match = name.match(/\b([A-Z]{2,}\d[\w]*)\b/);
  return match?.[1] ?? null;
}

function isExcludedProgramme(name: string) {
  return EXCLUDED_PROGRAMMES.has(name.replace(/\s+/g, " ").trim().toLowerCase());
}

function degreeNumber(id: string) {
  return id.match(/^degree-(\d+)/)?.[1] ?? "0";
}

function fillMissingUnitCodes(degrees: DegreeRecord[]) {
  for (const degree of degrees) {
    for (const unit of degree.units) {
      if (unit.code) continue;
      const fromAssessment = unit.assessments.find(item => item.unitNumber)?.unitNumber ?? null;
      unit.code = unitCode(unit.title, fromAssessment);
    }
  }
}

function displayTitle(name: string, _description: string | null, institution: string | null) {
  const key = `${name}|${institution ?? ""}`;
  if (TITLE_OVERRIDES[key]) return TITLE_OVERRIDES[key];
  return name.replace(/\s+/g, " ").trim();
}

function tableProps(lines: string[], start: number) {
  const props: Record<string, string> = {};
  let i = start;
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("|:--") || line.startsWith("| Property")) {
      i += 1;
      continue;
    }
    const row = TABLE_ROW.exec(line);
    if (!row) break;
    props[row[1]!.trim()] = row[2]!.trim();
    i += 1;
  }
  return { props, next: i };
}

function recordKind(uniType: string | null): AssessmentKind {
  return uniType?.toLowerCase() === "test" ? "test" : "assessment";
}

export function parseUniversityExport(markdown: string): UniversityCatalogue {
  const lines = markdown.split(/\r?\n/);
  const generated =
    markdown.match(/Generated on ([^\n]+)/)?.[1]?.trim() ?? new Date().toISOString();
  const degrees: DegreeRecord[] = [];
  let currentDegree: DegreeRecord | null = null;
  let currentUnit: UnitRecord | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const degree = DEGREE_HEADING.exec(line);
    const unit = UNIT_HEADING.exec(line);
    const item = ITEM_HEADING.exec(line);

    if (degree) {
      currentUnit = null;
      currentDegree = {
        id: slug(["degree", degree[1]!, degree[2]!]),
        title: degree[2]!.trim(),
        institution: null,
        status: "completed",
        start: null,
        end: null,
        description: null,
        units: [],
      };
      degrees.push(currentDegree);
      i += 1;
      continue;
    }

    if (line === "### Degree properties" && currentDegree) {
      const { props, next } = tableProps(lines, i + 1);
      const dates = parseDates(blank(props.Dates));
      const institution = parsePlaceName(blank(props.Place));
      currentDegree.title = displayTitle(blank(props.Name) ?? currentDegree.title, blank(props.Description), institution);
      currentDegree.id = slug(["degree", degreeNumber(currentDegree.id), currentDegree.title]);
      currentDegree.institution = institution;
      currentDegree.status = parseStatus(blank(props.Status));
      currentDegree.start = dates.start;
      currentDegree.end = dates.end;
      currentDegree.description = blank(props.Description);
      if (currentDegree.description && currentDegree.description !== currentDegree.title) {
        const oldName = blank(props.Name);
        if (oldName && currentDegree.title !== oldName) {
          currentDegree.description = `${currentDegree.title} from ${institution ?? "the awarding university"}`;
        }
      }
      i = next;
      continue;
    }

    if (unit && currentDegree) {
      const { props, next } = tableProps(lines, i + 1);
      const dates = parseDates(blank(props.Dates));
      const name = blank(props.Name) ?? unit[3]!.trim();
      currentUnit = {
        id: slug(["unit", unit[1]!, unit[2]!, name]),
        title: name.replace(/\s+/g, " ").trim(),
        code: unitCode(name, blank(props["Unit Number"])),
        status: parseStatus(blank(props.Status)),
        start: dates.start,
        end: dates.end,
        gpaPoints: parseGpa(blank(props["GPA Calculator"])),
        grade: blank(props["Grade Scale"]),
        description: blank(props.Description),
        assessments: [],
      };
      currentDegree.units.push(currentUnit);
      i = next;
      continue;
    }

    if (item && currentUnit) {
      const { props, next } = tableProps(lines, i + 1);
      const dates = parseDates(blank(props.Dates));
      const name = blank(props.Name) ?? item[4]!.trim();
      const record: AssessmentRecord = {
        id: slug(["item", item[1]!, item[2]!, item[3]!, name]),
        title: name.replace(/\s+/g, " ").trim(),
        kind: recordKind(blank(props["Uni Type"])),
        status: parseStatus(blank(props.Status)),
        start: dates.start,
        end: dates.end,
        gpaPoints: parseGpa(blank(props["GPA Calculator"])),
        grade: blank(props["Grade Scale"]),
        description: blank(props.Description),
        unitNumber: blank(props["Unit Number"]),
      };
      currentUnit.assessments.push(record);
      i = next;
      continue;
    }

    i += 1;
  }

  fillMissingUnitCodes(degrees);
  return {
    generated,
    degrees: degrees.filter(degree => !isExcludedProgramme(degree.title)),
  };
}
