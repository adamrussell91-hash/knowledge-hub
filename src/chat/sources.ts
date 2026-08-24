import { escapeHtml } from "../lib/dom";
import type { ResearchFinding, ResearchResult } from "../research/schema";

export const SOURCE_TAKE_CHARS = 160;

export function sourceTake(finding: Pick<ResearchFinding, "analysis" | "excerpt" | "stance" | "keyFinding">): string {
  const take = (finding.keyFinding || finding.analysis || finding.excerpt || "").replace(/\s+/g, " ").trim();
  if (!take) return finding.stance;
  if (take.length <= SOURCE_TAKE_CHARS) return take;
  return `${take.slice(0, SOURCE_TAKE_CHARS).trim()}…`;
}

export function researchFromFindings(findings: ResearchFinding[], query = ""): ResearchResult {
  return {
    query,
    round: 1,
    status: "done",
    findings: findings.filter(item => item.pageId && !item.pageId.startsWith("ext-")),
    gaps: [],
    followUpQueries: [],
  };
}

export function searchedNotesHtml(findings: ResearchFinding[], open = false, turnIndex?: number): string {
  const notes = findings.filter(item => item.pageId && !item.pageId.startsWith("ext-"));
  if (!notes.length) return "";
  const rows = notes
    .map(
      item => `<button class="chat__source" type="button" data-open-page="${escapeHtml(item.pageId)}">
        <span class="chat__source-title">${escapeHtml(item.title)}</span>
        <span class="chat__source-take">${escapeHtml(sourceTake(item))}</span>
      </button>`,
    )
    .join("");
  const turn = turnIndex === undefined ? "" : String(turnIndex);
  return `<details class="chat__fold"${open ? " open" : ""} data-searched-notes="${escapeHtml(turn)}">
    <summary>Searched notes (${notes.length})</summary>
    <div class="chat__sources">${rows}</div>
  </details>`;
}

export function thinkingHistoryHtml(ticks: string[], open = false): string {
  if (!ticks.length) return "";
  return `<details class="chat__fold"${open ? " open" : ""} data-thinking-history>
    <summary>Thinking history</summary>
    <ol class="chat__ticker">${ticks.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ol>
  </details>`;
}
