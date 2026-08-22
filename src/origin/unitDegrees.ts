import type { Origin } from "../domain/page";
import { mergeOrigins } from "./normalize";

/**
 * Unit code → degree title, recovered from University `Parent item`
 * on Uni Type = Unit pages (2026-08-22). Not used at hub runtime.
 * Two Child-and-Adolescent certificates share a truncated Notion title;
 * labels use the fuller names from each degree page’s Description.
 * Placeholder Notion parents (certificates that are not degrees, cohort
 * pages, and Notebook Cover) are not mapped.
 */
export const UNIT_DEGREE_LABELS: Record<string, string> = {
  ABOR3500: "Bachelor of Teaching and Arts Degree",
  AHIS1040: "Bachelor of Teaching and Arts Degree",
  AHIS3130: "Bachelor of Teaching and Arts Degree",
  AHIS3310: "Bachelor of Teaching and Arts Degree",
  AHIS3510: "Bachelor of Teaching and Arts Degree",
  EDED20512: "Master of Educational Neuroscience",
  EDED20513: "Master of Educational Neuroscience",
  EDED20514: "Master of Educational Neuroscience",
  EDED20515: "Master of Educational Neuroscience",
  EDED20517: "Master of Educational Neuroscience",
  EDEP600: "Graduate Certificate in Educational Leadership",
  EDEP601: "Graduate Certificate in Educational Leadership",
  EDGL901: "Master of Education (Educational Leadership)",
  EDGL903: "Master of Education (Educational Leadership)",
  EDGL909: "Master of Education (Educational Leadership)",
  EDGL919: "Master of Education (Educational Leadership)",
  EDGL923: "Master of Education (Educational Leadership)",
  EDGL941: "Master of Education (Educational Leadership)",
  EDGT976: "Master of Education (Educational Leadership)",
  EDST5321: "Master of Education (Gifted Education)",
  EDST5448: "Master of Education (Gifted Education)",
  EDST5802: "Master of Education (Gifted Education)",
  EDST5803: "Master of Education (Gifted Education)",
  EDST5805: "Master of Education (Gifted Education)",
  EDST5806: "Master of Education (Gifted Education)",
  EDST5807: "Master of Education (Gifted Education)",
  EDST5808: "Master of Education (Gifted Education)",
  EDST5888: "Master of Education (Gifted Education)",
  EDUC1003: "Bachelor of Teaching and Arts Degree",
  EDUC1008: "Bachelor of Teaching and Arts Degree",
  EDUC1751: "Bachelor of Teaching and Arts Degree",
  EDUC2012: "Bachelor of Teaching and Arts Degree",
  EDUC2036: "Bachelor of Teaching and Arts Degree",
  EDUC2050: "Bachelor of Teaching and Arts Degree",
  EDUC2101: "Bachelor of Teaching and Arts Degree",
  EDUC2103: "Bachelor of Teaching and Arts Degree",
  EDUC2195: "Bachelor of Teaching and Arts Degree",
  EDUC3026: "Bachelor of Teaching and Arts Degree",
  EDUC3038: "Bachelor of Teaching and Arts Degree",
  EDUC3195: "Bachelor of Teaching and Arts Degree",
  EDUC4090: "Bachelor of Teaching and Arts Degree",
  EDUC4136: "Bachelor of Teaching and Arts Degree",
  ENGL1002: "Bachelor of Teaching and Arts Degree",
  ENGL1201: "Bachelor of Teaching and Arts Degree",
  ENGL2201: "Bachelor of Teaching and Arts Degree",
  ENGL3006: "Bachelor of Teaching and Arts Degree",
  ENGL3045: "Bachelor of Teaching and Arts Degree",
  ENGL3202: "Bachelor of Teaching and Arts Degree",
  ENGL3656: "Bachelor of Teaching and Arts Degree",
  ENGL3730: "Bachelor of Teaching and Arts Degree",
  GPH510: "Graduate Certificate of Geography Teaching",
  GPH512: "Graduate Certificate of Geography Teaching",
  GPH513: "Graduate Certificate of Geography Teaching",
  GPH514: "Graduate Certificate of Geography Teaching",
  HCS409: "Graduate Certificate in Child and Adolescent Welfare",
  HCS513: "Graduate Certificate in Child and Adolescent Welfare",
  HIST1001: "Bachelor of Teaching and Arts Degree",
  HN06009: "Graduate Certificate in Child and Adolescent Mental Health",
  HNO6012: "Graduate Certificate in Child and Adolescent Mental Health",
  HNO6014: "Graduate Certificate in Child and Adolescent Mental Health",
  HNO6015: "Graduate Certificate in Child and Adolescent Mental Health",
  HNO609: "Graduate Certificate in Child and Adolescent Mental Health",
  PSY482: "Graduate Certificate in Child and Adolescent Welfare",
  PSYC101: "Graduate Diploma of Psychology",
  PSYC102: "Graduate Diploma of Psychology",
  PSYC206: "Graduate Diploma of Psychology",
  PSYC363: "Graduate Diploma of Psychology",
  SOCA1010: "Bachelor of Teaching and Arts Degree",
  TEAC7145: "Graduate Certificate of Teaching and Technology",
  TEAC7146: "Graduate Certificate of Teaching and Technology",
  WEL407: "Graduate Certificate in Child and Adolescent Welfare",
};

export function applyUnitDegreeMap(
  origins: Origin[],
  unitDegreeMap: Record<string, string> = UNIT_DEGREE_LABELS,
): Origin[] {
  const extra: Origin[] = [];
  for (const origin of origins) {
    if (origin.kind !== "unit") continue;
    const degree = unitDegreeMap[origin.label.toUpperCase()];
    if (degree) extra.push({ kind: "degree", label: degree });
  }
  return mergeOrigins(origins, extra);
}
