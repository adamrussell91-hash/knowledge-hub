import type { Origin } from "../domain/page";
import { normalizeOriginLabel } from "../origin/normalize";
import type { ResearchFinding } from "../research/schema";

export const BOOK_NOTE_WRITE_TOKENS = 3500;
export const BOOK_NOTE_BEST_CAP = 8;

export type BookContext = {
  label: string;
  locus?: string;
};

const CONFIDENCE_SCORE = { high: 3, medium: 1, low: -1 } as const;
const STANCE_SCORE = { supports: 2, complicates: 2, extends: 2, related: 0 } as const;
const RELATION_SCORE = { direct: 2, indirect: 1, interpretive: 0 } as const;

export function normalizeBookContext(value: unknown): BookContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { label?: unknown; locus?: unknown };
  const label = normalizeOriginLabel(typeof raw.label === "string" ? raw.label : "");
  if (!label) return undefined;
  const locus = typeof raw.locus === "string" ? raw.locus.replace(/\s+/g, " ").trim() : "";
  return locus ? { label, locus } : { label };
}

export function bookContextLine(book?: BookContext): string {
  if (!book?.label) return "";
  return book.locus ? `Reading: ${book.label} (${book.locus})` : `Reading: ${book.label}`;
}

export function resolveBookLabel(raw: string, catalog: string[] = []) {
  const typed = normalizeOriginLabel(raw);
  if (!typed) return "";
  const lower = typed.toLowerCase();
  const exact = catalog.find(item => item.toLowerCase() === lower);
  if (exact) return exact;
  const overlap = catalog
    .filter(item => {
      const name = item.toLowerCase();
      return lower.includes(name) || name.includes(lower);
    })
    .sort((left, right) => right.length - left.length)[0];
  return overlap ?? typed;
}

export function bookOrigin(book?: BookContext): Origin | undefined {
  if (!book?.label) return undefined;
  return { kind: "book", label: book.label };
}

export function scoreBookFinding(finding: ResearchFinding): number {
  const confidence = finding.confidence ? CONFIDENCE_SCORE[finding.confidence] : 1;
  const stance = STANCE_SCORE[finding.stance];
  const relation = finding.claimRelationship ? RELATION_SCORE[finding.claimRelationship] : 0;
  return confidence + stance + relation;
}

export function selectBestFindings(
  findings: ResearchFinding[],
  cap = BOOK_NOTE_BEST_CAP,
): ResearchFinding[] {
  if (!findings.length) return [];
  const ranked = [...findings].sort((left, right) => {
    const delta = scoreBookFinding(right) - scoreBookFinding(left);
    if (delta) return delta;
    return left.title.localeCompare(right.title);
  });
  const strong = ranked.filter(item => scoreBookFinding(item) >= 2);
  const pool = strong.length ? strong : ranked;
  return pool.slice(0, Math.min(cap, pool.length));
}
