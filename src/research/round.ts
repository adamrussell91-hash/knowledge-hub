import type { Candidate } from "./hybridRetrieve";
import type { ResearchFinding, ResearchResult, ResearchStatus } from "./schema";
import type { SynthesisOutput } from "./synthesize";

export const DEFAULT_MAX_ROUNDS = 5;
export const DEFAULT_MAX_MS = 10 * 60 * 1000;

export type PageSnippet = {
  title: string;
  excerpt: string;
  sourceUrl: string;
};

export type SessionState = {
  query: string;
  documentContext?: string;
  round: number;
  startedAt: number;
  findings: ResearchFinding[];
  gaps: string[];
  followUpQueries: string[];
  status: ResearchStatus;
  error?: string;
  k?: number;
  tags?: string[];
  maxRounds?: number;
  negation?: boolean;
};

export type RoundDeps = {
  retrieve: (query: string) => Promise<Candidate[]>;
  fetchBodies: (pageIds: string[]) => Promise<Map<string, PageSnippet>>;
    synthesize: (input: {
    query: string;
    documentContext?: string;
    sources: Array<PageSnippet & { pageId: string }>;
  }) => Promise<SynthesisOutput>;
  now?: () => number;
  maxRounds?: number;
  maxMs?: number;
  finalize?: boolean;
};

export function initialSession(input: {
  query: string;
  documentContext?: string;
  now?: number;
  k?: number;
  tags?: string[];
  maxRounds?: number;
  negation?: boolean;
}): SessionState {
  return {
    query: input.query,
    documentContext: input.documentContext,
    round: 0,
    startedAt: input.now ?? 0,
    findings: [],
    gaps: [],
    followUpQueries: [],
    status: "running",
    k: input.k,
    tags: input.tags,
    maxRounds: input.maxRounds,
    negation: input.negation,
  };
}

export function sessionToResult(state: SessionState): ResearchResult {
  return {
    query: state.query,
    round: state.round,
    status: state.status,
    findings: state.findings,
    gaps: state.gaps,
    followUpQueries: state.followUpQueries,
    ...(state.error ? { error: state.error } : {}),
  };
}

export function applyCancel(state: SessionState): SessionState {
  if (state.status === "done" || state.status === "error") return state;
  return { ...state, status: "cancelled" };
}

function dedupeFindings(findings: ResearchFinding[]) {
  const seen = new Set<string>();
  return findings.filter(finding => {
    if (seen.has(finding.pageId)) return false;
    seen.add(finding.pageId);
    return true;
  });
}

function shouldStop(state: SessionState, deps: RoundDeps, now: number) {
  if (deps.finalize) return true;
  const maxRounds = deps.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxMs = deps.maxMs ?? DEFAULT_MAX_MS;
  if (state.round >= maxRounds) return true;
  if (now - state.startedAt >= maxMs) return true;
  if (!state.followUpQueries.length) return true;
  return false;
}

export async function runRound(state: SessionState, deps: RoundDeps): Promise<SessionState> {
  if (state.status === "done" || state.status === "error" || state.status === "cancelled") return state;
  const now = deps.now ?? Date.now();
  const queries =
    state.round === 0
      ? [
          state.query,
          ...(state.negation ? [`What challenges, limits, or contradicts: ${state.query}`] : []),
        ]
      : state.followUpQueries.filter(Boolean);
  if (!queries.length) {
    return { ...state, status: "done", findings: dedupeFindings(state.findings) };
  }

  try {
    const retrievedLists = await Promise.all(queries.map(query => deps.retrieve(query)));
    const merged = new Map<string, Candidate>();
    for (const list of retrievedLists) {
      for (const hit of list) {
        const existing = merged.get(hit.pageId);
        if (!existing || hit.score > existing.score) merged.set(hit.pageId, hit);
      }
    }
    const candidates = [...merged.values()];
    const bodies = await deps.fetchBodies(candidates.map(item => item.pageId));
    const sources = candidates.map(item => {
      const body = bodies.get(item.pageId);
      return {
        pageId: item.pageId,
        title: body?.title ?? item.title,
        excerpt: body?.excerpt || item.excerpt,
        sourceUrl: body?.sourceUrl ?? "",
      };
    });
    const synthesis = await deps.synthesize({
      query: state.query,
      documentContext: state.documentContext,
      sources,
    });
    const findings = synthesis.findings.map(finding => {
      const source = sources.find(item => item.pageId === finding.pageId);
      return {
        ...finding,
        sourceUrl: finding.sourceUrl || source?.sourceUrl || finding.sourceUrl,
        title: finding.title || source?.title || finding.title,
      };
    });
    const next: SessionState = {
      ...state,
      round: state.round + 1,
      findings: [...state.findings, ...findings],
      gaps: synthesis.gaps,
      followUpQueries: synthesis.followUpQueries,
      status: "running",
    };
    if (shouldStop(next, deps, now)) {
      return { ...next, status: "done", findings: dedupeFindings(next.findings) };
    }
    return next;
  } catch (error) {
    return {
      ...state,
      status: "error",
      error: String(error),
      findings: state.findings,
    };
  }
}
