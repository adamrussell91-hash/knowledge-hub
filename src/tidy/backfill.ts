import { canStampWithoutModel, shouldSkipTidy } from "./messy";
import { isFailureCoolingDown, normalizeTidyState, runTidy, type TidyIO, type TidyRunResult, type TidyState } from "./run";

export const STUCK_TIDY_RETRY_IDS = [
  "page_notion_04bfec90635840a4a81ed02b41d9f5ef",
  "page_notion_02ad4c9951bb4ac3af4089ec1887da0a",
] as const;

export const TIDY_BACKFILL_BATCH_SIZE = 5;

export type TidySkipEntry = { id: string; reason: string };

export type TidyBackfillIO = Omit<TidyIO, "id" | "scan" | "count"> & {
  batchSize?: number;
  retryIds?: string[];
  commitBatch: (result: TidyRunResult) => Promise<void>;
  writeSkipList: (skips: TidySkipEntry[]) => Promise<void>;
};

export type TidyBackfillResult = {
  batches: number;
  stamped: number;
  selected: number;
  skips: TidySkipEntry[];
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function skipsFromState(state: TidyState): TidySkipEntry[] {
  return Object.entries(state.failures ?? {})
    .map(([id, failure]) => ({ id, reason: failure.reason }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function snapshotModelIds(io: TidyBackfillIO, now: string) {
  const state = normalizeTidyState(await io.readState());
  const ids: string[] = [];
  for (const id of await io.listPageIds()) {
    const page = await io.readPage(id);
    if (!page) continue;
    if (shouldSkipTidy(page, state.tidied[page.id])) continue;
    if (canStampWithoutModel(page)) continue;
    if (isFailureCoolingDown(state.failures?.[page.id], now)) continue;
    ids.push(id);
  }
  return ids;
}

export async function runTidyBackfill(io: TidyBackfillIO): Promise<TidyBackfillResult> {
  const batchSize = Math.max(1, io.batchSize ?? TIDY_BACKFILL_BATCH_SIZE);
  const retryIds = io.retryIds ?? [...STUCK_TIDY_RETRY_IDS];
  const knownIds = new Set(await io.listPageIds());
  const summary = { batches: 0, stamped: 0, selected: 0, skips: [] as TidySkipEntry[] };

  const stamped = await runTidy({ ...io, scan: true, count: 0 });
  if (stamped.stamped.length || stamped.errors.length) {
    await io.commitBatch(stamped);
    summary.batches += 1;
    summary.stamped += stamped.stamped.length;
  }

  const modelIds = await snapshotModelIds(io, io.now());
  for (const batch of chunk(modelIds, batchSize)) {
    const result = await runTidy({ ...io, scan: true, count: batch.length, listPageIds: async () => batch });
    await io.commitBatch(result);
    summary.batches += 1;
    summary.stamped += result.stamped.length;
    summary.selected += result.selected.length;
  }

  for (const id of retryIds) {
    if (!knownIds.has(id)) continue;
    const result = await runTidy({ ...io, id });
    await io.commitBatch(result);
    summary.batches += 1;
    summary.selected += result.selected.length;
  }

  const skips = skipsFromState(normalizeTidyState(await io.readState()));
  await io.writeSkipList(skips);
  summary.skips = skips;
  return summary;
}
