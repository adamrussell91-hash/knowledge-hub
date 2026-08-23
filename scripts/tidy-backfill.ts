import type { Page } from "../src/domain/page";
import { isTopicKeyword } from "../src/archive/keywordGraph";
import { isMessy, shouldSkipTidy } from "../src/tidy/messy";
import type { TidyUsage } from "../src/tidy/propose";
import { normalizeTidyState, runTidy, type TidyIO, type TidyState } from "../src/tidy/run";
import { canonicalTopicTag } from "../src/tidy/vocabulary";

export const KNOWN_STUCK_IDS = [
  "page_notion_02ad4c9951bb4ac3af4089ec1887da0a",
  "page_notion_04bfec90635840a4a81ed02b41d9f5ef",
] as const;

export type BackfillLeftover = { id: string; reason: string };

export type BackfillBatch = {
  batchNumber: number;
  attemptedIds: string[];
  successfulIds: string[];
  failures: BackfillLeftover[];
};

export type BackfillSummary = {
  scanned: number;
  stamped: number;
  attempted: number;
  succeeded: number;
  unchanged: number;
  failed: number;
  remainingModelEligible: number;
  remainingModelCalls: number;
  inputTokens: number;
  outputTokens: number;
  pilotCostUsd: number;
  pageCostSamplesUsd: number[];
  leftovers: BackfillLeftover[];
};

export type BackfillOptions = {
  io: Omit<TidyIO, "id" | "scan" | "count">;
  usage: TidyUsage[];
  batchSize?: number;
  modelLimit?: number;
  onPreflight?: (stampedIds: string[]) => Promise<void>;
  onBatch?: (batch: BackfillBatch) => Promise<void>;
};

export function needsModelTidy(page: Page) {
  if (isMessy(page)) return true;
  const topicTags = page.tags.filter(isTopicKeyword);
  return topicTags.length < 1 || topicTags.length > 3 || topicTags.some(tag => !canonicalTopicTag(tag));
}

function errorReason(id: string, errors: string[]) {
  const prefix = `${id}: `;
  return errors.map(error => error.startsWith(prefix) ? error.slice(prefix.length) : error).join("; ") || "tidy failed";
}

function recordFailure(state: TidyState, id: string, reason: string, now: string) {
  state.failures ??= {};
  const previous = state.failures[id];
  state.failures[id] = { attempts: (previous?.attempts ?? 0) + 1, lastFailedAt: now, reason };
}

export async function runTidyBackfill(options: BackfillOptions): Promise<BackfillSummary> {
  const batchSize = options.batchSize ?? 5;
  const modelLimit = options.modelLimit ?? Number.POSITIVE_INFINITY;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) throw new Error("batchSize must be an integer from 1 to 10");
  if (!(modelLimit === Number.POSITIVE_INFINITY || (Number.isInteger(modelLimit) && modelLimit > 0))) throw new Error("modelLimit must be a positive integer");

  const ids = await options.io.listPageIds();
  const state = normalizeTidyState(await options.io.readState());
  state.failures ??= {};
  const now = options.io.now();
  const stampedIds: string[] = [];
  const modelIds: string[] = [];
  const modelFailures = new Set<string>();
  const leftovers = new Map<string, string>();

  for (const id of ids) {
    const page = await options.io.readPage(id);
    if (!page) {
      const reason = "page was not found or is invalid";
      leftovers.set(id, reason);
      recordFailure(state, id, reason, now);
      continue;
    }
    if (shouldSkipTidy(page, state.tidied[id])) continue;
    if (!needsModelTidy(page)) {
      state.tidied[id] = now;
      delete state.failures[id];
      stampedIds.push(id);
      continue;
    }
    const previousFailure = state.failures[id];
    if (previousFailure?.backfillAttemptedAt) {
      leftovers.set(id, previousFailure.reason);
      modelFailures.add(id);
      continue;
    }
    modelIds.push(id);
  }

  if (stampedIds.length || leftovers.size) {
    await options.io.writeState({ ...state, lastRunAt: now });
    await options.onPreflight?.(stampedIds);
  }

  let modelCalls = 0;
  let succeeded = 0;
  let unchanged = 0;
  let batchNumber = 0;
  let nextModelIndex = 0;

  const attemptPage = async (id: string) => {
    let modelCalled = false;
    const markBackfillFailure = async (reason: string) => {
      const latest = normalizeTidyState(await options.io.readState());
      latest.failures ??= {};
      const failure = latest.failures[id];
      if (failure) failure.backfillAttemptedAt = options.io.now();
      else {
        recordFailure(latest, id, reason, options.io.now());
        latest.failures[id]!.backfillAttemptedAt = options.io.now();
      }
      await options.io.writeState({ ...latest, lastRunAt: options.io.now() });
    };
    try {
      const result = await runTidy({
        ...options.io,
        id,
        propose: page => {
          modelCalled = true;
          return options.io.propose(page);
        },
      });
      if (result.errors.length) {
        const reason = errorReason(id, result.errors);
        await markBackfillFailure(reason);
        leftovers.set(id, reason);
        modelFailures.add(id);
        return { ok: false as const, reason, modelCalled };
      }
      leftovers.delete(id);
      modelFailures.delete(id);
      succeeded++;
      if (result.skipped.includes(id)) unchanged++;
      return { ok: true as const, modelCalled };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await markBackfillFailure(reason);
      leftovers.set(id, reason);
      modelFailures.add(id);
      return { ok: false as const, reason, modelCalled };
    }
  };

  while (nextModelIndex < modelIds.length && modelCalls < modelLimit) {
    batchNumber++;
    const attemptedIds: string[] = [];
    const successfulIds: string[] = [];
    const failures: BackfillLeftover[] = [];
    let batchModelCalls = 0;
    while (nextModelIndex < modelIds.length && modelCalls < modelLimit && batchModelCalls < batchSize) {
      const id = modelIds[nextModelIndex++]!;
      attemptedIds.push(id);
      const result = await attemptPage(id);
      if (result.modelCalled) {
        modelCalls++;
        batchModelCalls++;
      }
      if (result.ok) successfulIds.push(id);
      else failures.push({ id, reason: result.reason });
    }
    if (successfulIds.length) await options.onBatch?.({ batchNumber, attemptedIds, successfulIds, failures });
  }

  const completedMainPass = nextModelIndex === modelIds.length;
  const fullRun = modelLimit === Number.POSITIVE_INFINITY;
  if (completedMainPass && fullRun) {
    const retryIds = KNOWN_STUCK_IDS.filter(id => leftovers.has(id));
    if (retryIds.length) {
      batchNumber++;
      const successfulIds: string[] = [];
      const failures: BackfillLeftover[] = [];
      for (const id of retryIds) {
        const result = await attemptPage(id);
        if (result.modelCalled) modelCalls++;
        if (result.ok) successfulIds.push(id);
        else failures.push({ id, reason: result.reason });
      }
      if (successfulIds.length) await options.onBatch?.({ batchNumber, attemptedIds: retryIds, successfulIds, failures });
    }
  }

  const inputTokens = options.usage.reduce((total, item) => total + item.inputTokens, 0);
  const outputTokens = options.usage.reduce((total, item) => total + item.outputTokens, 0);
  const pageCostSamplesUsd = options.usage.map(item => (item.inputTokens + item.outputTokens * 5) / 1_000_000);
  const finalLeftovers = [...leftovers].map(([id, reason]) => ({ id, reason })).sort((a, b) => a.id.localeCompare(b.id));
  const unprocessedModelIds = modelIds.length - nextModelIndex;
  const pendingKnownRetries = fullRun ? 0 : KNOWN_STUCK_IDS.filter(id => modelFailures.has(id)).length;

  return {
    scanned: ids.length,
    stamped: stampedIds.length,
    attempted: modelCalls,
    succeeded,
    unchanged,
    failed: finalLeftovers.length,
    remainingModelEligible: unprocessedModelIds + modelFailures.size,
    remainingModelCalls: unprocessedModelIds + pendingKnownRetries,
    inputTokens,
    outputTokens,
    pilotCostUsd: (inputTokens + outputTokens * 5) / 1_000_000,
    pageCostSamplesUsd,
    leftovers: finalLeftovers,
  };
}
