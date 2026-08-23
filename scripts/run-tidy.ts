import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runTidy } from "../src/tidy/run";
import { loadDotEnv } from "./loadLocalPages";
import { createLocalTidyIO } from "./tidy-local-io";

export type TidySkipEntry = { id: string; reason: string };
export type TidyArgs = {
  id?: string;
  scan?: boolean;
  count?: number;
  dataDir?: string;
  fromSkipList?: boolean;
  skipReason?: string;
  limit?: number;
};

export function parseTidyArgs(args: string[]): TidyArgs {
  const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const id = value("--id");
  const scan = args.includes("--scan");
  const fromSkipList = args.includes("--from-skip-list");
  const modes = [Boolean(id), scan, fromSkipList].filter(Boolean).length;
  if (modes !== 1) throw new Error("Use --id, --scan, or --from-skip-list");
  const rawCount = value("--count");
  const count = rawCount === undefined ? undefined : Number(rawCount);
  if (rawCount !== undefined && (!Number.isInteger(count) || count === undefined || count < 1)) throw new Error("--count must be a positive integer");
  const rawLimit = value("--limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (rawLimit !== undefined && (!Number.isInteger(limit) || limit === undefined || limit < 1)) throw new Error("--limit must be a positive integer");
  const skipReason = value("--reason");
  const resolvedCount = scan ? count ?? 1 : count;
  return {
    ...(id ? { id } : fromSkipList ? { fromSkipList: true } : { scan: true }),
    ...(resolvedCount ? { count: resolvedCount } : {}),
    ...(value("--data-dir") ? { dataDir: value("--data-dir") } : {}),
    ...(skipReason ? { skipReason } : {}),
    ...(fromSkipList ? { limit: limit ?? 10 } : limit ? { limit } : {}),
  };
}

export function selectSkipRetryIds(skips: TidySkipEntry[], reason: string, limit: number) {
  return skips.filter(entry => entry.reason === reason).map(entry => entry.id).slice(0, limit);
}

export function applySkipRetryResults(skips: TidySkipEntry[], results: Array<{ id: string; reason?: string }>) {
  const next = new Map(skips.map(entry => [entry.id, entry]));
  for (const result of results) {
    if (!result.reason) next.delete(result.id);
    else next.set(result.id, { id: result.id, reason: result.reason });
  }
  return [...next.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function assertNoTidyErrors(result: { errors: string[] }, mode: "id" | "scan" = "id") {
  if (mode === "scan") return;
  if (result.errors.length) throw new Error(`Tidy failed for ${result.errors.length} page(s): ${result.errors.join("; ")}`);
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseTidyArgs(args);
  await loadDotEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const dataDir = parsed.dataDir ?? path.join(process.cwd(), "migrated", "data-repo");
  const prompt = await readFile(path.join(process.cwd(), "prompts", "tidy.md"), "utf8");
  const io = createLocalTidyIO({ dataDir, apiKey, prompt });
  if (parsed.fromSkipList) {
    const skipPath = path.join(dataDir, "_tidy", "backfill-skip-list.json");
    const skips = JSON.parse(await readFile(skipPath, "utf8")) as TidySkipEntry[];
    const ids = selectSkipRetryIds(skips, parsed.skipReason ?? "Anthropic error 400", parsed.limit ?? 10);
    const results: Array<{ id: string; changed: string[]; skipped: string[]; errors: string[]; reason?: string }> = [];
    for (const id of ids) {
      const result = await runTidy({ ...io, id });
      const reason = result.errors[0]?.startsWith(`${id}: `) ? result.errors[0].slice(id.length + 2) : result.errors[0];
      results.push({ id, changed: result.changed, skipped: result.skipped, errors: result.errors, ...(reason ? { reason } : {}) });
      console.log(JSON.stringify({ id, changed: result.changed, skipped: result.skipped, errors: result.errors, reason: reason ?? null }));
    }
    const nextSkips = applySkipRetryResults(skips, results);
    await writeFile(skipPath, `${JSON.stringify(nextSkips, null, 2)}\n`);
    const summary = {
      attempted: results.length,
      succeeded: results.filter(item => !item.reason).length,
      failed: results.filter(item => item.reason).length,
      reasons: [...new Set(results.map(item => item.reason).filter(Boolean))],
    };
    console.log(JSON.stringify(summary));
    return summary;
  }
  const result = await runTidy({
    ...parsed,
    ...io,
  });
  console.log(JSON.stringify(result));
  assertNoTidyErrors(result, parsed.id ? "id" : "scan");
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
