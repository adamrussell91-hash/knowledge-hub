import type { Page, PageManifestEntry } from "../domain/page";
import { plainExcerpt } from "../lib/plainExcerpt";
import { topicTagsEqual } from "./applyTags";
import { canStampWithoutModel, isMessy, shouldSkipTidy } from "./messy";
import { applyTidyProposal, normalizeTidyBody } from "./propose";
import type { TidyProposal } from "./types";

export type TidyFailure = { attempts: number; lastFailedAt: string; reason: string; backfillAttemptedAt?: string };
export type TidyState = { lastRunAt?: string; tidied: Record<string, string>; failures?: Record<string, TidyFailure> };

const FAILURE_COOLDOWN_MS = 72 * 60 * 60 * 1000;

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

export function normalizeTidyState(value: unknown): TidyState {
  if (!value || typeof value !== "object") return { tidied: {} };
  const raw = value as { lastRunAt?: unknown; tidied?: unknown; failures?: unknown };
  const tidied = raw.tidied && typeof raw.tidied === "object" && !Array.isArray(raw.tidied)
    ? Object.fromEntries(Object.entries(raw.tidied).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const failures = raw.failures && typeof raw.failures === "object" && !Array.isArray(raw.failures)
    ? Object.fromEntries(Object.entries(raw.failures).filter((entry): entry is [string, TidyFailure] => {
      const failure = entry[1];
      return Boolean(
        failure && typeof failure === "object" && !Array.isArray(failure) &&
        Number.isInteger((failure as TidyFailure).attempts) && (failure as TidyFailure).attempts > 0 &&
        typeof (failure as TidyFailure).lastFailedAt === "string" &&
        typeof (failure as TidyFailure).reason === "string" &&
        ((failure as TidyFailure).backfillAttemptedAt === undefined || typeof (failure as TidyFailure).backfillAttemptedAt === "string"),
      );
    }))
    : {};
  return {
    ...(typeof raw.lastRunAt === "string" ? { lastRunAt: raw.lastRunAt } : {}),
    tidied,
    ...(Object.keys(failures).length ? { failures } : {}),
  };
}

/** Worker-safe excerpt generation; tidy core deliberately has no script or Node imports. */
export function excerptFromTidyBody(body: string, maxLen = 300) {
  return plainExcerpt(body, maxLen);
}

function recentlyFailed(state: TidyState, id: string, now: string) {
  const failedAt = Date.parse(state.failures?.[id]?.lastFailedAt ?? "");
  const current = Date.parse(now);
  return Number.isFinite(failedAt) && Number.isFinite(current) && current - failedAt < FAILURE_COOLDOWN_MS;
}

function selectPages(pages: Page[], state: TidyState, count: number, random: () => number, now: string) {
  const candidates = pages.filter(page => !shouldSkipTidy(page, state.tidied[page.id]) && !recentlyFailed(state, page.id, now));
  const messy = candidates.filter(isMessy);
  const rest = candidates.filter(page => !isMessy(page));
  // Randomise only the fill group; messy pages retain a deterministic priority.
  rest.sort(() => random() - 0.5);
  return [...messy, ...rest].slice(0, Math.min(1, Math.max(0, count)));
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

export async function runTidy(io: TidyIO) {
  const state = normalizeTidyState(await io.readState());
  state.failures ??= {};
  const now = io.now();
  const ids = io.id
    ? [io.id]
    : io.scan
      ? (await io.listPageIds()).filter(id => !recentlyFailed(state, id, now))
      : [];
  const pages: Page[] = [];
  const result = { selected: [] as string[], changed: [] as string[], skipped: [] as string[], stamped: [] as string[], errors: [] as string[] };
  const recordFailure = (id: string, reason: string) => {
    const previous = state.failures?.[id];
    state.failures![id] = { ...previous, attempts: (previous?.attempts ?? 0) + 1, lastFailedAt: now, reason };
  };
  for (const id of ids) {
    try {
      const page = await io.readPage(id);
      if (page) pages.push(page);
      else {
        const reason = "page was not found or is invalid";
        result.errors.push(`${id}: ${reason}`);
        recordFailure(id, reason);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.errors.push(`${id}: ${reason}`);
      recordFailure(id, reason);
    }
  }
  const selected = io.id ? pages : selectPages(pages, state, io.count ?? 1, io.random ?? Math.random, now);
  let manifest = await io.readManifest();
  result.selected = selected.map(page => page.id);

  for (const page of selected) {
    try {
      if (!io.id && shouldSkipTidy(page, state.tidied[page.id])) {
        result.skipped.push(page.id);
        continue;
      }
      if (!io.id && canStampWithoutModel(page)) {
        state.tidied[page.id] = now;
        delete state.failures[page.id];
        result.stamped.push(page.id);
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
            throw new Error(`${error instanceof Error ? error.message : String(error)}; manifest rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
          }
          throw error;
        }
        manifest = nextManifest;
        result.changed.push(page.id);
      } else result.skipped.push(page.id);
      state.tidied[page.id] = now;
      delete state.failures[page.id];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.errors.push(`${page.id}: ${reason}`);
      recordFailure(page.id, reason);
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
