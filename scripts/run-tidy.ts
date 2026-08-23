import { readFile } from "node:fs/promises";
import path from "node:path";
import { runTidy } from "../src/tidy/run";
import { loadDotEnv } from "./loadLocalPages";
import { createLocalTidyIO } from "./tidy-local-io";

export type TidyArgs = { id?: string; scan?: boolean; count?: number; dataDir?: string };

export function parseTidyArgs(args: string[]): TidyArgs {
  const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const id = value("--id");
  const scan = args.includes("--scan");
  if ((!id && !scan) || (id && scan)) throw new Error("Use --id or --scan");
  const rawCount = value("--count");
  const count = rawCount === undefined ? undefined : Number(rawCount);
  if (rawCount !== undefined && (!Number.isInteger(count) || count === undefined || count < 1)) throw new Error("--count must be a positive integer");
  const resolvedCount = scan ? count ?? 1 : count;
  return { ...(id ? { id } : { scan: true }), ...(resolvedCount ? { count: resolvedCount } : {}), ...(value("--data-dir") ? { dataDir: value("--data-dir") } : {}) };
}

export function assertNoTidyErrors(result: { errors: string[] }) {
  if (result.errors.length) throw new Error(`Tidy failed for ${result.errors.length} page(s): ${result.errors.join("; ")}`);
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseTidyArgs(args);
  await loadDotEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const dataDir = parsed.dataDir ?? path.join(process.cwd(), "migrated", "data-repo");
  const prompt = await readFile(path.join(process.cwd(), "prompts", "tidy.md"), "utf8");
  const result = await runTidy({
    ...parsed,
    ...createLocalTidyIO({ dataDir, apiKey, prompt }),
  });
  console.log(JSON.stringify(result));
  assertNoTidyErrors(result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
