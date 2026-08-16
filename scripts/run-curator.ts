import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { PageSchema } from "../src/domain/page";
import { embedQuery } from "../src/lib/embed";
import { judgeLinks } from "../src/curator/propose";
import { excerptLine, runCurator } from "../src/curator/run";
import type { CorpusEntry } from "../src/curator/run";
import type { DismissedPair, PendingProposal } from "../src/curator/schema";
import { loadDotEnv } from "./loadLocalPages";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function loadCorpus(): Promise<CorpusEntry[]> {
  const localIndex = path.join(process.cwd(), "migrated", "index.json");
  try {
    const rows = JSON.parse(await readFile(localIndex, "utf8")) as {
      pageId: string;
      title: string;
      excerpt?: string;
      vector: number[];
    }[];
    return rows.map(row => ({
      pageId: row.pageId,
      title: row.title,
      excerpt: row.excerpt ?? "",
      vector: row.vector,
    }));
  } catch {
    return [];
  }
}

async function main() {
  await loadDotEnv();
  const flag = process.argv.indexOf("--data-dir");
  const dataDir = flag >= 0 ? process.argv[flag + 1] : path.join(process.cwd(), "migrated", "data-repo");
  if (!dataDir) throw new Error("--data-dir needs a path");
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const embeddings = process.env.EMBEDDINGS_API_KEY;
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is required");
  if (!embeddings) throw new Error("EMBEDDINGS_API_KEY is required");

  const curatorDir = path.join(dataDir, "_curator");
  const statePath = path.join(curatorDir, "state.json");
  const pendingPath = path.join(curatorDir, "pending-proposals.json");
  const dismissedPath = path.join(curatorDir, "dismissed.json");
  await mkdir(curatorDir, { recursive: true });

  const head = await git(dataDir, ["rev-parse", "HEAD"]);
  const existingState = await readJson<{ lastProcessedSha?: string }>(statePath, {});
  if (!existingState.lastProcessedSha) {
    await writeFile(statePath, JSON.stringify({ lastProcessedSha: head }, null, 2) + "\n");
    console.log(`Seeded curator state at ${head} (zero backlog).`);
    return;
  }

  const result = await runCurator({
    gitNameStatus: async fromSha => git(dataDir, ["diff", "--name-status", `${fromSha}..HEAD`]),
    headSha: async () => head,
    readState: async () => readJson(statePath, { lastProcessedSha: head }),
    writeState: async state => {
      await writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
    },
    readPending: async () => readJson<PendingProposal[]>(pendingPath, []),
    writePending: async pending => {
      await writeFile(pendingPath, JSON.stringify(pending, null, 2) + "\n");
    },
    readDismissed: async () => readJson<DismissedPair[]>(dismissedPath, []),
    writeDismissed: async dismissed => {
      await writeFile(dismissedPath, JSON.stringify(dismissed, null, 2) + "\n");
    },
    readPage: async id => {
      try {
        return PageSchema.parse(JSON.parse(await readFile(path.join(dataDir, "pages", `${id}.json`), "utf8")));
      } catch {
        return null;
      }
    },
    writePage: async page => {
      await writeFile(path.join(dataDir, "pages", `${page.id}.json`), JSON.stringify(page, null, 2) + "\n");
    },
    listPageIds: async () => {
      const files = await readdir(path.join(dataDir, "pages"));
      return files.filter(file => file.endsWith(".json")).map(file => file.replace(/\.json$/, ""));
    },
    corpus: await loadCorpus(),
    embed: async text => embedQuery(text, embeddings),
    judge: async (note, candidates) => judgeLinks({ note, candidates, apiKey: anthropic }),
    now: () => new Date().toISOString(),
    excerpt: excerptLine,
  });
  console.log(JSON.stringify(result));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
