import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PageSchema, type Page, type PageManifestEntry } from "../src/domain/page";
import { runTidyBackfill, TIDY_BACKFILL_BATCH_SIZE } from "../src/tidy/backfill";
import { proposeTidy } from "../src/tidy/propose";
import { runTidy } from "../src/tidy/run";
import type { TidyState } from "../src/tidy/run";
import { loadDotEnv } from "./loadLocalPages";

const execFileAsync = promisify(execFile);

export type TidyBackfillArgs = {
  dataDir?: string;
  batchSize?: number;
  commit?: boolean;
  stampOnly?: boolean;
  retryIds?: string[];
};

export function parseTidyBackfillArgs(args: string[]): TidyBackfillArgs {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const rawCount = value("--batch-size");
  const batchSize = rawCount === undefined ? undefined : Number(rawCount);
  if (rawCount !== undefined && (!Number.isInteger(batchSize) || batchSize === undefined || batchSize < 1)) {
    throw new Error("--batch-size must be a positive integer");
  }
  const retryRaw = value("--retry-ids");
  const retryIds = retryRaw ? retryRaw.split(",").map(id => id.trim()).filter(Boolean) : undefined;
  return {
    ...(value("--data-dir") ? { dataDir: value("--data-dir") } : {}),
    ...(batchSize ? { batchSize } : {}),
    commit: !args.includes("--no-commit"),
    stampOnly: args.includes("--stamp-only"),
    ...(args.includes("--no-retry") ? { retryIds: [] } : retryIds ? { retryIds } : {}),
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function git(dataDir: string, gitArgs: string[]) {
  await execFileAsync("git", ["-C", dataDir, ...gitArgs]);
}

async function commitDataRepo(dataDir: string, message: string) {
  await git(dataDir, ["add", "pages", "manifest.json", "_tidy"]);
  const dirty = await execFileAsync("git", ["-C", dataDir, "diff", "--cached", "--quiet"]).then(
    () => false,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 1) return true;
      throw error;
    },
  );
  if (!dirty) return false;
  await git(dataDir, [
    "-c", "user.name=knowledge-hub-tidy",
    "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit", "-m", message,
  ]);
  await execFileAsync("bash", [path.join(process.cwd(), "scripts", "push-data-repo.sh")], { cwd: dataDir });
  return true;
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseTidyBackfillArgs(args);
  await loadDotEnv();
  const dataDir = parsed.dataDir ?? path.join(process.cwd(), "migrated", "data-repo");
  const tidyDir = path.join(dataDir, "_tidy");
  const statePath = path.join(tidyDir, "state.json");
  const skipPath = path.join(tidyDir, "backfill-skip-list.json");
  await mkdir(tidyDir, { recursive: true });

  const io = {
    listPageIds: async () => (await readdir(path.join(dataDir, "pages"))).filter(file => file.endsWith(".json")).map(file => file.slice(0, -5)),
    readPage: async (id: string) => {
      try {
        return PageSchema.parse(JSON.parse(await readFile(path.join(dataDir, "pages", `${id}.json`), "utf8")));
      } catch {
        return null;
      }
    },
    writePage: async (page: Page) => writeFile(path.join(dataDir, "pages", `${page.id}.json`), `${JSON.stringify(page, null, 2)}\n`),
    readManifest: () => readJson<PageManifestEntry[]>(path.join(dataDir, "manifest.json"), []),
    writeManifest: async (entries: PageManifestEntry[]) => writeFile(path.join(dataDir, "manifest.json"), `${JSON.stringify(entries, null, 2)}\n`),
    readState: () => readJson<TidyState>(statePath, { tidied: {} }),
    writeState: (state: TidyState) => writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`),
    now: () => new Date().toISOString(),
  };

  const commitBatch = async () => {
    if (!parsed.commit) return;
    await commitDataRepo(dataDir, "Tidy archive notes.");
  };

  if (parsed.stampOnly) {
    const result = await runTidy({
      ...io,
      scan: true,
      count: 0,
      propose: async () => {
        throw new Error("stamp-only backfill must not call the model");
      },
    });
    await writeFile(skipPath, `${JSON.stringify([], null, 2)}\n`);
    await commitBatch();
    console.log(JSON.stringify({ stampOnly: true, stamped: result.stamped.length }));
    return result;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  const prompt = await readFile(path.join(process.cwd(), "prompts", "tidy.md"), "utf8");
  const summary = await runTidyBackfill({
    ...io,
    batchSize: parsed.batchSize ?? TIDY_BACKFILL_BATCH_SIZE,
    ...(parsed.retryIds ? { retryIds: parsed.retryIds } : {}),
    propose: page => proposeTidy({ page, prompt, apiKey }),
    commitBatch,
    writeSkipList: async skips => writeFile(skipPath, `${JSON.stringify(skips, null, 2)}\n`),
  });
  if (parsed.commit) await commitDataRepo(dataDir, "Tidy backfill skip list.");
  console.log(JSON.stringify(summary));
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
