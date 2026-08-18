import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { corpusFromResearchPack, loadResearchPack } from "../../src/curator/corpusLoad";
import { judgeLinks } from "../../src/curator/propose";
import { excerptLine, runCurator, type CorpusEntry, type CuratorIO } from "../../src/curator/run";
import type { DismissedPair, PendingProposal } from "../../src/curator/schema";
import { nameStatusFromCompareFiles, resolveStartSha } from "../../src/curator/window";
import { PageSchema, type Page } from "../../src/domain/page";
import { embedQuery } from "../../src/lib/embed";
import { GitHubWriteError, getContent, putContent } from "./_lib/githubWrite";

const STATE = "_curator/state.json";
const PENDING = "_curator/pending-proposals.json";
const DISMISSED = "_curator/dismissed.json";
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

export type CuratorRunDeps = {
  getContent: typeof getContent;
  putContent: typeof putContent;
  githubGet: (url: string) => Promise<unknown>;
  loadCorpus: () => Promise<CorpusEntry[]>;
  embed: (text: string) => Promise<number[]>;
  judge: CuratorIO["judge"];
  now?: () => string;
};

type GithubCommit = { sha: string; parents?: { sha: string }[] };
type GithubCompare = { files?: { filename: string; status: string }[] };
type GithubTree = { tree?: { path?: string; type?: string }[] };

function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function executeCuratorRun(input: { repo: string; token: string; deps: CuratorRunDeps }) {
  const { repo, token, deps } = input;
  const headPayload = (await deps.githubGet(`https://api.github.com/repos/${repo}/commits/HEAD`)) as GithubCommit;
  const head = headPayload.sha;
  const stateFile = await deps.getContent(repo, token, STATE);
  const lastProcessedSha = parseJson<{ lastProcessedSha?: string }>(stateFile?.text, {}).lastProcessedSha;
  let recent: { sha: string; parents: string[] }[] = [];
  if (!lastProcessedSha) {
    const since = new Date(Date.now() - RECENT_MS).toISOString();
    const commits = (await deps.githubGet(
      `https://api.github.com/repos/${repo}/commits?path=pages&since=${encodeURIComponent(since)}&per_page=100`,
    )) as GithubCommit[];
    recent = (Array.isArray(commits) ? commits : []).map(commit => ({
      sha: commit.sha,
      parents: (commit.parents ?? []).map(parent => parent.sha),
    }));
  }
  const start = resolveStartSha(lastProcessedSha, head, recent);
  if (start.skip) {
    await deps.putContent(repo, token, STATE, JSON.stringify({ lastProcessedSha: start.sha }), stateFile?.sha, "Seed curator state");
    return { processed: 0, proposed: 0, heldBack: 0, seeded: true };
  }

  const compare = (await deps.githubGet(
    `https://api.github.com/repos/${repo}/compare/${start.sha}...${head}`,
  )) as GithubCompare;
  const pendingFile = await deps.getContent(repo, token, PENDING);
  const dismissedFile = await deps.getContent(repo, token, DISMISSED);
  let stateSha = stateFile?.sha;
  let pendingSha = pendingFile?.sha;
  let dismissedSha = dismissedFile?.sha;
  const corpus = await deps.loadCorpus();
  if (!corpus.length) throw new Error("Research corpus is empty");

  const io: CuratorIO = {
    gitNameStatus: async () => nameStatusFromCompareFiles(compare.files ?? []),
    headSha: async () => head,
    readState: async () => ({ lastProcessedSha: start.sha }),
    writeState: async state => {
      await deps.putContent(repo, token, STATE, JSON.stringify(state), stateSha, "Update curator state");
      stateSha = undefined;
    },
    readPending: async () => parseJson<PendingProposal[]>(pendingFile?.text, []),
    writePending: async pending => {
      await deps.putContent(repo, token, PENDING, JSON.stringify(pending), pendingSha, "Update curator pending");
      pendingSha = undefined;
    },
    readDismissed: async () => parseJson<DismissedPair[]>(dismissedFile?.text, []),
    writeDismissed: async dismissed => {
      await deps.putContent(repo, token, DISMISSED, JSON.stringify(dismissed), dismissedSha, "Update curator dismissed");
      dismissedSha = undefined;
    },
    readPage: async id => {
      const file = await deps.getContent(repo, token, `pages/${id}.json`);
      if (!file) return null;
      const parsed = PageSchema.safeParse(JSON.parse(file.text));
      return parsed.success ? parsed.data : null;
    },
    writePage: async (page: Page) => {
      const current = await deps.getContent(repo, token, `pages/${page.id}.json`);
      await deps.putContent(repo, token, `pages/${page.id}.json`, JSON.stringify(page), current?.sha, `Link ${page.id}`);
    },
    listPageIds: async () => {
      const tree = (await deps.githubGet(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`)) as GithubTree;
      return (tree.tree ?? [])
        .filter(item => item.type === "blob" && item.path?.startsWith("pages/") && item.path.endsWith(".json"))
        .map(item => item.path!.slice("pages/".length, -".json".length));
    },
    corpus,
    embed: deps.embed,
    judge: deps.judge,
    now: deps.now ?? (() => new Date().toISOString()),
    excerpt: excerptLine,
  };

  return runCurator(io);
}

export async function r2ResearchLoader(env: {
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}) {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const get = async (key: string) =>
    client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  return {
    text: async (key: string) => {
      try {
        const object = await get(key);
        return (await object.Body?.transformToString()) ?? null;
      } catch {
        return null;
      }
    },
    bytes: async (key: string) => {
      try {
        const object = await get(key);
        return (await object.Body?.transformToByteArray()) ?? null;
      } catch {
        return null;
      }
    },
  };
}

export async function executeCuratorRunFromEnv(env: NodeJS.ProcessEnv) {
  const repo = env.GITHUB_DATA_REPO;
  const token = env.GITHUB_DATA_REPO_TOKEN;
  const anthropic = env.ANTHROPIC_API_KEY;
  const embeddings = env.EMBEDDINGS_API_KEY;
  const accountId = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!repo || !token) throw new Error("Data repo is not configured");
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is required");
  if (!embeddings) throw new Error("EMBEDDINGS_API_KEY is required");
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 is not configured");
  }
  const loader = await r2ResearchLoader({
    R2_ACCOUNT_ID: accountId,
    R2_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  });
  return executeCuratorRun({
    repo,
    token,
    deps: {
      getContent,
      putContent,
      githubGet: async url => {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (!response.ok) throw new GitHubWriteError(`GitHub data repo error ${response.status}: ${url}`, response.status);
        return response.json();
      },
      loadCorpus: async () => corpusFromResearchPack(await loadResearchPack(loader)),
      embed: text => embedQuery(text, embeddings),
      judge: (note, candidates) => judgeLinks({ note, candidates, apiKey: anthropic }),
    },
  });
}
