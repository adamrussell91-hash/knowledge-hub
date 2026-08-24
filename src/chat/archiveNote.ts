import { formatEvidencePacket } from "../research/evidencePacket";
import type { ResearchFinding, ResearchResult } from "../research/schema";
import { SYNTHESIS_DETAIL_CAP } from "./synthesisProtocol";

export const WRITE_DETAIL_CAP = 8;
export const WRITE_EXCERPT_CHARS = 180;
export const WRITE_SYNTHESIS_EXCERPT_CHARS = 240;

function excerptFor(finding: ResearchFinding, chars: number) {
  return finding.excerpt.replace(/\s+/g, " ").trim().slice(0, chars);
}

function lineFor(finding: ResearchFinding, index: number) {
  const excerpt = excerptFor(finding, WRITE_EXCERPT_CHARS);
  return `${index + 1}. "${finding.title}" (${finding.pageId})${excerpt ? `\n${excerpt}` : ""}`;
}

function synthesisLineFor(finding: ResearchFinding, index: number) {
  const excerpt = excerptFor(finding, WRITE_SYNTHESIS_EXCERPT_CHARS);
  return `${index + 1}. "${finding.title}" (${finding.pageId}) [${finding.stance}]\n${formatEvidencePacket(finding)}${excerpt ? `\n${excerpt}` : ""}`;
}

function packNote(
  research: ResearchResult,
  detailed: ResearchFinding[],
  rest: ResearchFinding[],
  line: (finding: ResearchFinding, index: number) => string,
) {
  const lines = detailed.map(line);
  const more = rest.length
    ? `\n${rest.length} further notes (titles only; cite by id if relevant): ${rest
        .map(item => `${item.title} (${item.pageId})`)
        .join("; ")}`
    : "";
  return `Archive findings (${research.findings.length} notes — cite as [Title](pageId) markdown links; never invent pages; never write a raw page id in the answer):\n${lines.join("\n\n")}${more}`;
}

/** Compact brief for Claude. Full findings stay on the result for citation cards. */
export function compactArchiveNote(research: ResearchResult): string {
  if (!research.findings.length) {
    const gaps = research.gaps.length ? research.gaps.join("; ") : "none named";
    return `The archive did not give you anything usable. Name the gaps (${gaps}). Do not say "no results found."`;
  }
  return packNote(
    research,
    research.findings.slice(0, WRITE_DETAIL_CAP),
    research.findings.slice(WRITE_DETAIL_CAP),
    lineFor,
  );
}

/** Synthesis sittings get evidence packets so claims can be source-mapped. */
export function compactSynthesisNote(research: ResearchResult): string {
  if (!research.findings.length) return compactArchiveNote(research);
  return `${packNote(
    research,
    research.findings.slice(0, SYNTHESIS_DETAIL_CAP),
    research.findings.slice(SYNTHESIS_DETAIL_CAP),
    synthesisLineFor,
  )}\nUse these packets for source type, method, population, key finding, claim relationship, and limitation. If a field says it is unavailable, do not invent it.`;
}

/** Follow-up turns keep the sitting's searched notes as the first source pack. */
export function compactSittingNote(research: ResearchResult, synthesis = false): string {
  const note = synthesis ? compactSynthesisNote(research) : compactArchiveNote(research);
  return `${note}\n\nThese are the sitting's searched notes. Use them first. If they do not cover this question, say what is missing. Do not invent pages. A wider archive pull is not attached this turn.`;
}
