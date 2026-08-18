import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { PageSchema } from "../src/domain/page";
import { corpusFromResearchPack, loadResearchPack } from "../src/curator/corpusLoad";
import { judgeLinks } from "../src/curator/propose";
import { excerptLine, runCurator } from "../src/curator/run";
import type { CorpusEntry } from "../src/curator/run";
import type { DismissedPair, PendingProposal } from "../src/curator/schema";
import { resolveStartSha } from "../src/curator/window";
import { embedQuery } from "../src/lib/embed";
import { r2ResearchLoader } from "../netlify/functions/curatorRun";
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
    if (rows.length) {
      return rows.map(row => ({
        pageId: row.pageId,
        title: row.title,
        excerpt: row.excerpt ?? "",
        vector: row.vector,
      }));
    }
  } catch {
    /* fall through to R2 */
  }
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Research corpus missing: add migrated/index.json or R2 credentials");
  }
  const pack = await loadResearchPack(
    await r2ResearchLoader({
      R2_ACCOUNT_ID: accountId,
      R2_BUCKET: bucket,
      R2_ACCESS_KEY_ID: accessKeyId,
      R2_SECRET_ACCESS_KEY: secretAccessKey,
    }),
  );
  const corpus = corpusFromResearchPack(pack);
  if (!corpus.length) throw new Error("Research corpus is empty");
  return corpus;
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
  let recent: { sha: string; parents: string[] }[] = [];
  if (!existingState.lastProcessedSha) {
    const log = await git(dataDir, ["log", "--since=14 days ago", "--format=%H %P", "--", "pages"]);
    recent = log
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const [sha, ...parents] = line.split(" ");
        return { sha: sha ?? "", parents };
      });
  }
  const start = resolveStartSha(existingState.lastProcessedSha, head, recent);
  if (existingState.lastProcessedSha !== start.sha) {
    await writeFile(statePath, JSON.stringify({ lastProcessedSha: start.sha }, null, 2) + "\n");
  }
  if (start.skip) {
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
