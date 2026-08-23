import type { Page, PageManifestEntry } from "../domain/page";
import { plainExcerpt } from "../lib/plainExcerpt";
import { topicTagsEqual } from "./applyTags";
import { canStampWithoutModel, isMessy, shouldSkipTidy } from "./messy";
import { applyTidyProposal, normalizeTidyBody } from "./propose";
import type { TidyProposal } from "./types";

export type TidyFailureRecord = { at: string; reason: string; attempts: number };

export type TidyState = { lastRunAt?: string; tidied: Record<string, string>; failures?: Record<string, TidyFailureRecord> };

export type TidyRunResult = {
  selected: string[];
  changed: string[];
  skipped: string[];
  stamped: string[];
  errors: string[];
};

export const TIDY_FAILURE_COOLDOWN_MS = 72 * 60 * 60 * 1000;

export type TidyIO = {
  id?: string;
  scan?: boolean;
  count?: number;
  listPageIds: () => Promise<string[]>;
  readPage: (id: string) => Promise<Page | null>;
  writePage: (page: Page) => Promise<void>;
  readManifest: () => Promise<PageManifestEntry[]>;
  writeManifest: (entries: PageManifestEntry[]) => Promise<void>;
  readState: () => Promise<unknown>;
  writeState: (state: TidyState) => Promise<void>;
  propose: (page: Page) => Promise<TidyProposal | null>;
  now: () => string;
  random?: () => number;
};

function samePage(a: Page, b: Page) {
  return a.title === b.title && normalizeTidyBody(a.body) === normalizeTidyBody(b.body) && topicTagsEqual(a.tags, b.tags);
}

function normalizeFailure(value: unknown): TidyFailureRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { at?: unknown; reason?: unknown; attempts?: unknown };
  if (typeof raw.at !== "string" || typeof raw.reason !== "string") return null;
  const attempts = typeof raw.attempts === "number" && Number.isFinite(raw.attempts) && raw.attempts >= 1
    ? Math.floor(raw.attempts)
    : 1;
  return { at: raw.at, reason: raw.reason, attempts };
}

export function normalizeTidyState(value: unknown): TidyState {
  if (!value || typeof value !== "object") return { tidied: {} };
  const raw = value as { lastRunAt?: unknown; tidied?: unknown; failures?: unknown };
  const tidied = raw.tidied && typeof raw.tidied === "object" && !Array.isArray(raw.tidied)
    ? Object.fromEntries(Object.entries(raw.tidied).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const failures = raw.failures && typeof raw.failures === "object" && !Array.isArray(raw.failures)
    ? Object.fromEntries(
      Object.entries(raw.failures).flatMap(([id, entry]) => {
        const normalized = normalizeFailure(entry);
        return normalized ? [[id, normalized] as const] : [];
      }),
    )
    : undefined;
  return {
    ...(typeof raw.lastRunAt === "string" ? { lastRunAt: raw.lastRunAt } : {}),
    tidied,
    ...(failures && Object.keys(failures).length ? { failures } : {}),
  };
}

export function isFailureCoolingDown(failure: TidyFailureRecord | undefined, now: string) {
  if (!failure) return false;
  const at = Date.parse(failure.at);
  const current = Date.parse(now);
  return Number.isFinite(at) && Number.isFinite(current) && current - at < TIDY_FAILURE_COOLDOWN_MS;
}

function recordFailure(state: TidyState, id: string, reason: string, now: string) {
  const previous = state.failures?.[id];
  state.failures = {
    ...state.failures,
    [id]: { at: now, reason, attempts: (previous?.attempts ?? 0) + 1 },
  };
}

function clearFailure(state: TidyState, id: string) {
  if (!state.failures?.[id]) return;
  const { [id]: _removed, ...rest } = state.failures;
  if (Object.keys(rest).length) state.failures = rest;
  else delete state.failures;
}

function markTidied(state: TidyState, id: string, now: string) {
  state.tidied[id] = now;
  clearFailure(state, id);
}

/** Worker-safe excerpt generation; tidy core deliberately has no script or Node imports. */
export function excerptFromTidyBody(body: string, maxLen = 300) {
  return plainExcerpt(body, maxLen);
}

function selectPages(pages: Page[], state: TidyState, count: number, now: string, random: () => number) {
  const candidates = pages.filter(page => (
    !shouldSkipTidy(page, state.tidied[page.id])
    && !canStampWithoutModel(page)
    && !isFailureCoolingDown(state.failures?.[page.id], now)
  ));
  const messy = candidates.filter(isMessy);
  const rest = candidates.filter(page => !isMessy(page));
  // Randomise only the fill group; messy pages retain a deterministic priority.
  rest.sort(() => random() - 0.5);
  return [...messy, ...rest].slice(0, Math.max(0, count));
}

function upsertManifestEntry(manifest: PageManifestEntry[], page: Page): PageManifestEntry[] {
  const entry: PageManifestEntry = {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt: excerptFromTidyBody(page.body),
    created_at: page.created_at,
    ...(page.origins?.length ? { origins: page.origins } : {}),
  };
  const existing = manifest.findIndex(item => item.id === page.id);
  return existing < 0
    ? [...manifest, entry]
    : manifest.map((item, index) => (index === existing ? { ...item, title: entry.title, tags: entry.tags, excerpt: entry.excerpt, origins: entry.origins } : item));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runTidy(io: TidyIO): Promise<TidyRunResult> {
  const state = normalizeTidyState(await io.readState());
  const now = io.now();
  const ids = io.id ? [io.id] : io.scan ? await io.listPageIds() : [];
  const pages: Page[] = [];
  const result: TidyRunResult = { selected: [], changed: [], skipped: [], stamped: [], errors: [] };
  for (const id of ids) {
    try {
      const page = await io.readPage(id);
      if (page) pages.push(page);
      else {
        result.errors.push(`${id}: page was not found or is invalid`);
        recordFailure(state, id, "page was not found or is invalid", now);
      }
    } catch (error) {
      const reason = errorMessage(error);
      result.errors.push(`${id}: ${reason}`);
      recordFailure(state, id, reason, now);
    }
  }

  if (io.scan && !io.id) {
    for (const page of pages) {
      if (shouldSkipTidy(page, state.tidied[page.id])) continue;
      if (!canStampWithoutModel(page)) continue;
      markTidied(state, page.id, now);
      result.stamped.push(page.id);
    }
  }

  const selected = io.id ? pages : selectPages(pages, state, io.count ?? 1, now, io.random ?? Math.random);
  let manifest = await io.readManifest();
  result.selected = selected.map(page => page.id);

  for (const page of selected) {
    try {
      if (!io.id && shouldSkipTidy(page, state.tidied[page.id])) {
        result.skipped.push(page.id);
        continue;
      }
      if (!io.id && isFailureCoolingDown(state.failures?.[page.id], now)) {
        result.skipped.push(page.id);
        continue;
      }
      const proposal = await io.propose(page);
      if (!proposal) throw new Error("model returned no valid tidy proposal");
      const proposed = applyTidyProposal(page, proposal);
      const next = { ...proposed, body: normalizeTidyBody(proposed.body), updated_at: now };
      if (!samePage(page, next)) {
        const nextManifest = upsertManifestEntry(manifest, next);
        await io.writeManifest(nextManifest);
        try {
          await io.writePage(next);
        } catch (error) {
          try {
            await io.writeManifest(manifest);
          } catch (rollbackError) {
            throw new Error(`${errorMessage(error)}; manifest rollback failed: ${errorMessage(rollbackError)}`);
          }
          throw error;
        }
        manifest = nextManifest;
        result.changed.push(page.id);
      } else result.skipped.push(page.id);
      markTidied(state, page.id, now);
    } catch (error) {
      const reason = errorMessage(error);
      result.errors.push(`${page.id}: ${reason}`);
      recordFailure(state, page.id, reason, now);
    }
  }
  await io.writeState({ ...state, lastRunAt: now });
  return result;
}

export async function tidyOnePage(id: string, io: Omit<TidyIO, "id" | "scan" | "count">): Promise<Page> {
  const result = await runTidy({ ...io, id });
  if (result.errors.length) throw new Error(result.errors.join("; "));
  const page = await io.readPage(id);
  if (!page) throw new Error(`${id}: page was not found or is invalid`);
  if (!result.skipped.includes(id)) return page;
  const next = { ...page, updated_at: io.now() };
  await io.writePage(next);
  return next;
}
