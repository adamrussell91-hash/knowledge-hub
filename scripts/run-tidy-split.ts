import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { excerptFromTidyBody, normalizeTidyState, type TidyState } from "../src/tidy/run";
import { splitLeftoverPage, TIDY_SPLIT_MAX_CHARS } from "../src/tidy/split";
import { loadDotEnv } from "./loadLocalPages";
import type { TidySkipEntry } from "./run-tidy";
import { createLocalTidyIO } from "./tidy-local-io";

export type SplitArgs = { dataDir: string; reason: string; maxChars: number };

export function parseTidySplitArgs(args: string[]): SplitArgs {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const dataDir = value("--data-dir");
  if (!dataDir) throw new Error("--data-dir is required");
  const rawMax = value("--max-chars");
  const maxChars = rawMax === undefined ? TIDY_SPLIT_MAX_CHARS : Number(rawMax);
  if (!Number.isInteger(maxChars) || maxChars < 500) throw new Error("--max-chars must be an integer of at least 500");
  return { dataDir, reason: value("--reason") ?? "model returned no valid tidy proposal", maxChars };
}

export type SplitSummary = {
  scanned: number;
  split: number;
  created: number;
  unchanged: number;
  tidyIds: string[];
};

export async function main(args = process.argv.slice(2)) {
  const parsed = parseTidySplitArgs(args);
  await loadDotEnv();
  const tidyDir = path.join(parsed.dataDir, "_tidy");
  const skipPath = path.join(tidyDir, "backfill-skip-list.json");
  const io = createLocalTidyIO({ dataDir: parsed.dataDir, apiKey: "split-only", prompt: "" });
  const skips = JSON.parse(await readFile(skipPath, "utf8")) as TidySkipEntry[];
  const targets = skips.filter(entry => entry.reason === parsed.reason);
  const now = io.now();
  const state = normalizeTidyState(await io.readState());
  state.failures ??= {};
  let manifest = await io.readManifest();
  const remaining = new Map(skips.map(entry => [entry.id, entry]));
  const tidyIds: string[] = [];
  let split = 0;
  let created = 0;
  let unchanged = 0;

  const upsert = async (page: Parameters<typeof io.writePage>[0]) => {
    await io.writePage(page);
    const entry = {
      id: page.id,
      title: page.title,
      area: page.area,
      tags: page.tags,
      excerpt: excerptFromTidyBody(page.body),
      created_at: page.created_at,
      ...(page.origins?.length ? { origins: page.origins } : {}),
    };
    const index = manifest.findIndex(item => item.id === page.id);
    manifest = index < 0 ? [...manifest, entry] : manifest.map((item, itemIndex) => (itemIndex === index ? { ...item, ...entry } : item));
  };

  for (const target of targets) {
    const page = await io.readPage(target.id);
    if (!page) continue;
    const result = splitLeftoverPage(page, now, undefined, parsed.maxChars);
    if (!result.created.length) {
      unchanged += 1;
      tidyIds.push(page.id);
      continue;
    }
    await upsert(result.kept);
    for (const child of result.created) {
      await upsert(child);
      tidyIds.push(child.id);
    }
    tidyIds.push(result.kept.id);
    remaining.delete(page.id);
    delete state.failures[page.id];
    split += 1;
    created += result.created.length;
  }

  await io.writeManifest(manifest);
  await io.writeState({ ...state, lastRunAt: now });
  await mkdir(tidyDir, { recursive: true });
  await writeFile(skipPath, `${JSON.stringify([...remaining.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`);
  const summary: SplitSummary = { scanned: targets.length, split, created, unchanged, tidyIds: [...new Set(tidyIds)] };
  await writeFile(path.join(tidyDir, "last-split.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ scanned: summary.scanned, split: summary.split, created: summary.created, unchanged: summary.unchanged, tidyIds: summary.tidyIds.length }));
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
