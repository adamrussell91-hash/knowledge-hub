import type { ResearchFinding, ResearchResult } from "../research/schema";

export const WRITE_DETAIL_CAP = 8;
export const WRITE_EXCERPT_CHARS = 180;

function lineFor(finding: ResearchFinding, index: number) {
  const excerpt = finding.excerpt.replace(/\s+/g, " ").trim().slice(0, WRITE_EXCERPT_CHARS);
  return `${index + 1}. "${finding.title}" (${finding.pageId})${excerpt ? `\n${excerpt}` : ""}`;
}

/** Compact brief for Claude. Full findings stay on the result for citation cards. */
export function compactArchiveNote(research: ResearchResult): string {
  if (!research.findings.length) {
    const gaps = research.gaps.length ? research.gaps.join("; ") : "none named";
    return `The archive did not give you anything usable. Name the gaps (${gaps}). Do not say "no results found."`;
  }
  const detailed = research.findings.slice(0, WRITE_DETAIL_CAP);
  const rest = research.findings.slice(WRITE_DETAIL_CAP);
  const lines = detailed.map(lineFor);
  const more = rest.length
    ? `\n${rest.length} further notes (titles only; cite by id if relevant): ${rest
        .map(item => `${item.title} (${item.pageId})`)
        .join("; ")}`
    : "";
  return `Archive findings (${research.findings.length} notes — cite these ids, never invent pages):\n${lines.join("\n\n")}${more}`;
}
