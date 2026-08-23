import { execFile } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TidyUsage } from "../src/tidy/propose";
import { loadDotEnv } from "./loadLocalPages";
import { runTidyBackfill, type BackfillLeftover, type BackfillSummary } from "./tidy-backfill";
import { createLocalTidyIO } from "./tidy-local-io";

const execFileAsync = promisify(execFile);
const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type BackfillArgs = { dataDir: string; batchSize: number; modelLimit?: number };

function positiveInteger(raw: string | undefined, name: string) {
  const parsed = raw === undefined ? undefined : Number(raw);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function parseBackfillArgs(args: string[]): BackfillArgs {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const dataDir = value("--data-dir");
  if (!dataDir) throw new Error("--data-dir is required");
  const full = args.includes("--full");
  const rawLimit = value("--model-limit");
  if (full && rawLimit !== undefined) throw new Error("Use --model-limit or --full, not both");
  if (!full && rawLimit === undefined) throw new Error("Use --model-limit or --full");
  const batchSize = value("--batch-size") === undefined ? 5 : positiveInteger(value("--batch-size"), "--batch-size");
  if (batchSize > 10) throw new Error("--batch-size must be from 1 to 10");
  const modelLimit = rawLimit === undefined ? undefined : positiveInteger(rawLimit, "--model-limit");
  return { dataDir, batchSize, ...(modelLimit === undefined ? {} : { modelLimit }) };
}

export function assertCleanStatus(status: string) {
  if (status.trim()) throw new Error("knowledge-hub-data must be clean before backfill starts");
}

export function backfillBatchMessage(batchNumber: number) {
  return `Tidy archive notes (backfill batch ${batchNumber}).`;
}

export function serializeSkipList(leftovers: BackfillLeftover[]) {
  return `${JSON.stringify(leftovers.map(({ id, reason }) => ({ id, reason })), null, 2)}\n`;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
}

export function costProjection(summary: Pick<BackfillSummary,
  "attempted" | "remainingModelEligible" | "inputTokens" | "outputTokens" | "pilotCostUsd" | "pageCostSamplesUsd"
>) {
  const attempted = Math.max(1, summary.attempted);
  const projectedRemainingInputTokens = summary.inputTokens / attempted * summary.remainingModelEligible;
  const projectedRemainingOutputTokens = summary.outputTokens / attempted * summary.remainingModelEligible;
  const projectedRemainingCostUsd = (projectedRemainingInputTokens + projectedRemainingOutputTokens * 5) / 1_000_000;
  const samples = [
    ...summary.pageCostSamplesUsd,
    ...Array.from({ length: Math.max(0, summary.attempted - summary.pageCostSamplesUsd.length) }, () => 0),
  ];
  return {
    projectedRemainingInputTokens,
    projectedRemainingOutputTokens,
    projectedRemainingCostUsd,
    projectedTotalCostUsd: summary.pilotCostUsd + projectedRemainingCostUsd,
    lowTotalCostUsd: summary.pilotCostUsd + percentile(samples, 0.1) * summary.remainingModelEligible,
    highTotalCostUsd: summary.pilotCostUsd + percentile(samples, 0.9) * summary.remainingModelEligible,
  };
}

async function git(dataDir: string, args: string[]) {
  return (await execFileAsync("git", args, { cwd: dataDir })).stdout.trim();
}

async function assertDataRepo(dataDir: string) {
  const [requested, root] = await Promise.all([
    realpath(dataDir),
    git(dataDir, ["rev-parse", "--show-toplevel"]).then(value => realpath(value)),
  ]);
  if (requested !== root) throw new Error("--data-dir must be the knowledge-hub-data repository root");
  assertCleanStatus(await git(dataDir, ["status", "--porcelain"]));
}

async function hasStagedChanges(dataDir: string) {
  try {
    await execFileAsync("git", ["diff", "--cached", "--quiet"], { cwd: dataDir });
    return false;
  } catch (error) {
    if ((error as { code?: number }).code === 1) return true;
    throw error;
  }
}

async function commitAndPush(dataDir: string, message: string) {
  await git(dataDir, ["add", "--", "pages", "manifest.json", "_tidy"]);
  if (!await hasStagedChanges(dataDir)) return false;
  await git(dataDir, ["commit", "-m", message]);
  await execFileAsync("bash", [path.join(codeRoot, "scripts", "push-data-repo.sh")], { cwd: dataDir });
  return true;
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseBackfillArgs(args);
  await loadDotEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  await assertDataRepo(parsed.dataDir);
  const prompt = await readFile(path.join(codeRoot, "prompts", "tidy.md"), "utf8");
  const usage: TidyUsage[] = [];
  const io = createLocalTidyIO({ dataDir: parsed.dataDir, apiKey, prompt, onUsage: item => usage.push(item) });
  const summary = await runTidyBackfill({
    io,
    usage,
    batchSize: parsed.batchSize,
    modelLimit: parsed.modelLimit,
    onPreflight: async () => { await commitAndPush(parsed.dataDir, "Mark clean archive notes tidied (backfill preflight)."); },
    onBatch: async batch => { await commitAndPush(parsed.dataDir, backfillBatchMessage(batch.batchNumber)); },
  });

  if (summary.remainingModelEligible > 0) {
    await commitAndPush(parsed.dataDir, "Record tidy backfill pilot progress.");
  } else {
    await writeFile(path.join(parsed.dataDir, "_tidy", "backfill-skip-list.json"), serializeSkipList(summary.leftovers));
    await commitAndPush(parsed.dataDir, "Record tidy backfill leftovers.");
  }
  const report = { ...summary, projection: costProjection(summary) };
  console.log(JSON.stringify(report));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
