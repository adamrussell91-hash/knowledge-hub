import { embedQuery } from "../lib/embed";
import { loadCorpusCached } from "./corpusCache";
import { excerptFromBody, fetchPageBody, type PageBody } from "./fetchPageBody";
import { hybridRetrieve } from "./hybridRetrieve";
import { initialSession, runRound, sessionToResult, type SessionState } from "./round";
import { applyResearchScope } from "./scope";
import type { ResearchResult } from "./schema";
import { synthesizeWithAnthropic } from "./synthesize";

export type KernelSearchInput = {
  query: string;
  documentContext?: string;
  k?: number;
  tags?: string[];
  maxRounds?: number;
  negation?: boolean;
};

export type KernelEnv = {
  ARCHIVE: {
    get: (key: string) => Promise<{
      text: () => Promise<string>;
      arrayBuffer: () => Promise<ArrayBuffer>;
    } | null>;
  };
  ANTHROPIC_API_KEY: string;
  EMBEDDINGS_API_KEY: string;
  GITHUB_DATA_REPO?: string;
  GITHUB_DATA_REPO_TOKEN?: string;
};

async function r2Text(env: KernelEnv, key: string) {
  const object = await env.ARCHIVE.get(key);
  return object ? object.text() : null;
}

async function r2Bytes(env: KernelEnv, key: string) {
  const object = await env.ARCHIVE.get(key);
  return object ? object.arrayBuffer() : null;
}

async function githubPage(env: KernelEnv, pageId: string): Promise<PageBody | null> {
  if (!env.GITHUB_DATA_REPO || !env.GITHUB_DATA_REPO_TOKEN) return null;
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_DATA_REPO}/contents/pages/${pageId}.json`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_DATA_REPO_TOKEN}`,
      Accept: "application/vnd.github.raw",
    },
  });
  if (!response.ok) return null;
  const page = (await response.json()) as PageBody;
  return page.id ? page : null;
}

function roundDeps(env: KernelEnv, search: Pick<KernelSearchInput, "k" | "tags"> = {}) {
  return {
    retrieve: async (query: string) => {
      const corpus = await loadCorpusCached({
        text: key => r2Text(env, key),
        bytes: key => r2Bytes(env, key),
      });
      const scoped = applyResearchScope(
        corpus.manifest,
        corpus.index,
        search.tags?.length ? { tags: search.tags } : undefined,
      );
      const queryVector = env.EMBEDDINGS_API_KEY ? await embedQuery(query, env.EMBEDDINGS_API_KEY) : null;
      return hybridRetrieve({
        query,
        manifest: scoped.manifest,
        index: scoped.index,
        queryVector,
        k: search.k,
      });
    },
    fetchBodies: async (pageIds: string[]) => {
      const entries = await Promise.all(
        pageIds.map(async pageId => {
          const page = await fetchPageBody(pageId, {
            fromR2: async id => {
              const raw = await r2Text(env, `research/pages/${id}.json`);
              return raw ? (JSON.parse(raw) as PageBody) : null;
            },
            fromGitHub: id => githubPage(env, id),
          });
          if (!page) return null;
          return [
            pageId,
            {
              title: page.title,
              excerpt: excerptFromBody(page.body),
              sourceUrl: page.source_notion_url,
            },
          ] as const;
        }),
      );
      return new Map(entries.filter((entry): entry is readonly [string, { title: string; excerpt: string; sourceUrl: string }] => Boolean(entry)));
    },
    synthesize: async (input: { query: string; documentContext?: string; sources: { pageId: string; title: string; excerpt: string; sourceUrl: string }[] }) =>
      synthesizeWithAnthropic({
        query: input.query,
        documentContext: input.documentContext,
        sources: input.sources,
        apiKey: env.ANTHROPIC_API_KEY,
      }),
  };
}

export async function runQuickKernel(input: KernelSearchInput, env: KernelEnv): Promise<ResearchResult> {
  const state = await runRound(
    initialSession({
      query: input.query,
      documentContext: input.documentContext,
      now: Date.now(),
      k: input.k,
      tags: input.tags,
      negation: input.negation,
      maxRounds: 1,
    }),
    {
      ...roundDeps(env, input),
      now: () => Date.now(),
      finalize: true,
    },
  );
  return sessionToResult(state);
}

export async function runDeepRoundKernel(state: SessionState, env: KernelEnv): Promise<SessionState> {
  return runRound(state, {
    ...roundDeps(env, { k: state.k, tags: state.tags }),
    maxRounds: state.maxRounds,
    now: () => Date.now(),
  });
}
