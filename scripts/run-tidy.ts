import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSchema } from "../src/domain/page";
import type { PageManifestEntry } from "../src/domain/page";
import { proposeTidy } from "../src/tidy/propose";
import { runTidy } from "../src/tidy/run";
import type { TidyState } from "../src/tidy/run";
import { loadDotEnv } from "./loadLocalPages";

export type TidyArgs = { id?: string; scan?: boolean; count?: number; dataDir?: string };

export function parseTidyArgs(args: string[]): TidyArgs {
  const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const id = value("--id");
  const scan = args.includes("--scan");
  if ((!id && !scan) || (id && scan)) throw new Error("Use --id or --scan");
  const rawCount = value("--count");
  const count = rawCount === undefined ? undefined : Number(rawCount);
  if (rawCount !== undefined && (!Number.isInteger(count) || count === undefined || count < 1)) throw new Error("--count must be a positive integer");
  return { ...(id ? { id } : { scan: true }), ...(count ? { count } : {}), ...(value("--data-dir") ? { dataDir: value("--data-dir") } : {}) };
}

export function assertNoTidyErrors(result: { errors: string[] }) {
  if (result.errors.length) throw new Error(`Tidy failed for ${result.errors.length} page(s): ${result.errors.join("; ")}`);
}

async function readJson<T>(file: string, fallback: T): Promise<T> { try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return fallback; } }

export async function main(args = process.argv.slice(2)) {
  const parsed = parseTidyArgs(args);
  await loadDotEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const dataDir = parsed.dataDir ?? path.join(process.cwd(), "migrated", "data-repo");
  const prompt = await readFile(path.join(process.cwd(), "prompts", "tidy.md"), "utf8");
  const tidyDir = path.join(dataDir, "_tidy");
  const statePath = path.join(tidyDir, "state.json");
  await mkdir(tidyDir, { recursive: true });
  const result = await runTidy({
    ...parsed,
    listPageIds: async () => (await readdir(path.join(dataDir, "pages"))).filter(file => file.endsWith(".json")).map(file => file.slice(0, -5)),
    readPage: async id => { try { return PageSchema.parse(JSON.parse(await readFile(path.join(dataDir, "pages", `${id}.json`), "utf8"))); } catch { return null; } },
    writePage: async page => writeFile(path.join(dataDir, "pages", `${page.id}.json`), JSON.stringify(page, null, 2) + "\n"),
    readManifest: () => readJson<PageManifestEntry[]>(path.join(dataDir, "manifest.json"), []),
    writeManifest: async entries => writeFile(path.join(dataDir, "manifest.json"), JSON.stringify(entries, null, 2) + "\n"),
    readState: () => readJson<TidyState>(statePath, { tidied: {} }),
    writeState: state => writeFile(statePath, JSON.stringify(state, null, 2) + "\n"),
    propose: page => proposeTidy({ page, prompt, apiKey }), now: () => new Date().toISOString(),
  });
  console.log(JSON.stringify(result));
  assertNoTidyErrors(result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
