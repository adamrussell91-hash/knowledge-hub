import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSchema } from "../src/domain/page";
import type { PageManifestEntry } from "../src/domain/page";
import { proposeRetag, runRetag } from "../src/tidy/retag";
import { loadDotEnv } from "./loadLocalPages";

export type RetagArgs = { id?: string; scan?: boolean; dataDir?: string };

export function parseRetagArgs(args: string[]): RetagArgs {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const id = value("--id");
  const scan = args.includes("--scan") || !id;
  if (id && args.includes("--scan")) throw new Error("Use --id or --scan");
  return { ...(id ? { id } : { scan: true }), ...(value("--data-dir") ? { dataDir: value("--data-dir") } : {}) };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseRetagArgs(args);
  await loadDotEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const dataDir = parsed.dataDir ?? path.join(process.cwd(), "migrated", "data-repo");
  const prompt = await readFile(path.join(process.cwd(), "prompts", "retag.md"), "utf8");
  const result = await runRetag({
    ...(parsed.id ? { id: parsed.id } : {}),
    readPage: async id => {
      try {
        return PageSchema.parse(JSON.parse(await readFile(path.join(dataDir, "pages", `${id}.json`), "utf8")));
      } catch {
        return null;
      }
    },
    writePage: async page => writeFile(path.join(dataDir, "pages", `${page.id}.json`), JSON.stringify(page, null, 2) + "\n"),
    readManifest: () => readJson<PageManifestEntry[]>(path.join(dataDir, "manifest.json"), []),
    writeManifest: async entries => writeFile(path.join(dataDir, "manifest.json"), JSON.stringify(entries, null, 2) + "\n"),
    propose: input => proposeRetag({ ...input, prompt, apiKey }),
    now: () => new Date().toISOString(),
  });
  console.log(JSON.stringify(result));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
