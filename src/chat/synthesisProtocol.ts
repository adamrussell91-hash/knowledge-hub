import { thematicSynthesis } from "../clementine/pack";
import { filled } from "../research/evidencePacket";
import type { ResearchResult, Stance } from "../research/schema";

export const SYNTHESIS_WRITE_TOKENS = 4000;
export const SYNTHESIS_DETAIL_CAP = 12;
export const MISSING_EXPORT = "Not available from the current database export.";

export const SYNTHESIS_SECTION_MARKERS = [
  { id: "question", label: "research question interpreted", pattern: /research question interpreted|question (this|the) archive/i },
  { id: "corpus", label: "corpus summary", pattern: /corpus summary|notes retrieved|distinct sources/i },
  { id: "method", label: "method trace", pattern: /method trace|coding approach|inclusion threshold/i },
  { id: "claim", label: "central synthesis claim", pattern: /central (synthesis )?claim|organising claim/i },
  { id: "matrix", label: "theme evidence matrix", pattern: /theme evidence|direct support|indirect support/i },
  { id: "levels", label: "theoretical integration", pattern: /theoretical integration|level of explanation|explanatory level/i },
  { id: "limits", label: "contradictions and limits", pattern: /contradictions and limits|severity/i },
  { id: "answer", label: "answer to the research question", pattern: /answer to the (research )?question/i },
] as const;

const CENTRAL_STANCES = new Set<Stance>(["supports", "complicates", "extends"]);

export type CorpusAudit = {
  retrieved: number;
  distinctSources: number;
  central: number;
  peripheral: number;
  gapCount: number;
  rounds: number;
  sourceTypeKnown: number;
  methodKnown: number;
  populationKnown: number;
  keyFindingKnown: number;
  tags: Array<{ tag: string; count: number }>;
  stanceCounts: Record<Stance, number>;
  unavailable: string[];
};

export function corpusAuditFromResearch(research: ResearchResult): CorpusAudit {
  const distinct = new Set(research.findings.map(item => item.pageId));
  const stanceCounts: Record<Stance, number> = {
    supports: 0,
    complicates: 0,
    extends: 0,
    related: 0,
  };
  const tagCounts = new Map<string, number>();
  let sourceTypeKnown = 0;
  let methodKnown = 0;
  let populationKnown = 0;
  let keyFindingKnown = 0;
  let central = 0;
  for (const finding of research.findings) {
    stanceCounts[finding.stance] += 1;
    if (CENTRAL_STANCES.has(finding.stance)) central += 1;
    if (finding.sourceType && finding.sourceType !== "unknown") sourceTypeKnown += 1;
    if (filled(finding.method)) methodKnown += 1;
    if (filled(finding.population)) populationKnown += 1;
    if (filled(finding.keyFinding)) keyFindingKnown += 1;
    for (const tag of finding.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return {
    retrieved: research.findings.length,
    distinctSources: distinct.size,
    central,
    peripheral: research.findings.length - central,
    gapCount: research.gaps.length,
    rounds: research.round,
    sourceTypeKnown,
    methodKnown,
    populationKnown,
    keyFindingKnown,
    tags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag)),
    stanceCounts,
    unavailable: [
      "initial code count",
      "merged or split theme decisions",
      "full-note bodies beyond the attached excerpts",
    ],
  };
}

export function formatCorpusAudit(audit: CorpusAudit): string {
  const tags = audit.tags.length
    ? audit.tags.slice(0, 8).map(item => `${item.tag} (${item.count})`).join("; ")
    : MISSING_EXPORT;
  const stances = (Object.entries(audit.stanceCounts) as [Stance, number][])
    .map(([stance, count]) => `${stance} ${count}`)
    .join(", ");
  return `Corpus audit (exact counts from this pull, not estimates):
- Notes retrieved: ${audit.retrieved}
- Distinct sources: ${audit.distinctSources}
- Central stances (supports / complicates / extends): ${audit.central}
- Peripheral (related only): ${audit.peripheral}
- Gaps named: ${audit.gapCount}
- Rounds completed: ${audit.rounds}
- Source type known: ${audit.sourceTypeKnown}/${audit.retrieved}
- Method known: ${audit.methodKnown}/${audit.retrieved}
- Population known: ${audit.populationKnown}/${audit.retrieved}
- Key finding known: ${audit.keyFindingKnown}/${audit.retrieved}
- Topic tags represented: ${tags}
- Stance mix: ${stances}
Unavailable from this export: ${audit.unavailable.join("; ")}. Report those as ${MISSING_EXPORT} rather than guessing.
Theme confidence rules: high = two or more direct sources, or one major theoretical source plus one empirical source; medium = one direct source plus one interpretive connection; low = mostly inference. Do not mark every theme high.`;
}

export function thematicSynthesisProtocol(): string {
  return thematicSynthesis;
}

export function auditSynthesisReply(reply: string) {
  const present: string[] = [];
  const missing: string[] = [];
  for (const section of SYNTHESIS_SECTION_MARKERS) {
    if (section.pattern.test(reply)) present.push(section.id);
    else missing.push(section.id);
  }
  return { present, missing };
}

