import type { Origin, PageManifestEntry } from "../domain/page";
import { applyUnitDegreeMap } from "../origin/unitDegrees";
import { resolvedOrigins } from "../origin/notesPlace";
import { topicKeywords } from "./keywordGraph";

export type ShowAllGrouping = "tags" | "notebooks" | "degrees";

export const SHOW_ALL_GROUPINGS: readonly ShowAllGrouping[] = ["tags", "notebooks", "degrees"];

export function graphOrigins(page: {
  id?: string;
  tags?: string[];
  origins?: Origin[];
  source_notion_id?: string;
  source_notion_url?: string;
}): Origin[] {
  return applyUnitDegreeMap(resolvedOrigins(page));
}

export function isUniversityNote(page: PageManifestEntry) {
  if (page.area === "university") return true;
  return graphOrigins(page).some(origin => origin.kind === "degree" || origin.kind === "unit");
}

export function isNotebookNote(page: PageManifestEntry) {
  if (isUniversityNote(page)) return false;
  return graphOrigins(page).some(origin => origin.kind === "notebook");
}

export function hubLabelsFor(page: PageManifestEntry, grouping: ShowAllGrouping): string[] {
  if (grouping === "tags") return topicKeywords(page.tags);
  const origins = graphOrigins(page);
  if (grouping === "notebooks") {
    return unique(origins.filter(origin => origin.kind === "notebook").map(origin => origin.label));
  }
  const degrees = unique(origins.filter(origin => origin.kind === "degree").map(origin => origin.label));
  if (degrees.length) return degrees;
  const units = unique(origins.filter(origin => origin.kind === "unit").map(origin => origin.label));
  if (units.length) return units;
  return page.area === "university" ? ["University"] : [];
}

export function filterShowAllEntries(entries: PageManifestEntry[], grouping: ShowAllGrouping) {
  return entries.filter(entry => {
    if (!hubLabelsFor(entry, grouping).length) return false;
    if (grouping === "notebooks") return !isUniversityNote(entry);
    if (grouping === "degrees") return !isNotebookNote(entry);
    return true;
  });
}

export function showAllGroupingLabel(grouping: ShowAllGrouping) {
  if (grouping === "notebooks") return "Notebooks";
  if (grouping === "degrees") return "Degrees";
  return "Tags";
}

export function showAllGroupingMeta(grouping: ShowAllGrouping) {
  if (grouping === "notebooks") return "Notebooks · university notes hidden";
  if (grouping === "degrees") return "University degrees · notebook notes hidden";
  return "Twenty topics · click a note to see its connections · at most 3 per note";
}

function unique(values: string[]) {
  return [...new Set(values)];
}
