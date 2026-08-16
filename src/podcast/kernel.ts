import { embedQuery } from "../lib/embed";
import { loadCorpusCached } from "../research/corpusCache";
import { excerptFromBody, fetchPageBody, type PageBody } from "../research/fetchPageBody";
import { hybridRetrieve } from "../research/hybridRetrieve";
import type { ResearchScope } from "../research/scope";
import { parseResearchScope } from "../research/scope";
import type { PodcastNote } from "./run";
import {
  PodcastDialsSchema,
  PodcastEpisodeSchema,
  PodcastModeSchema,
  PodcastSeriesSchema,
  type PodcastDials,
  type PodcastEpisode,
  type PodcastMode,
  type PodcastSeries,
} from "./schema";
import { applyPodcastScope, connectorScope, type TagMatch } from "./select";

export const ANTHROPIC_TIMEOUT_MS = 90_000;
export const GITHUB_TIMEOUT_MS = 20_000;

export const PODCAST_INDEX_KEY = "podcast/index.json";
export const podcastEpisodeKey = (id: string) => `podcast/episodes/${id}.json`;
export const podcastSeriesKey = (id: string) => `podcast/series/${id}.json`;

export type PodcastArchive = {
  get: (key: string) => Promise<{
    text: () => Promise<string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
  } | null>;
  put: (key: string, value: string | ArrayBuffer) => Promise<unknown>;
};

export type PodcastKernelEnv = {
  ARCHIVE: PodcastArchive;
  ANTHROPIC_API_KEY: string;
  EMBEDDINGS_API_KEY?: string;
  GITHUB_DATA_REPO?: string;
  GITHUB_DATA_REPO_TOKEN?: string;
  AI?: {
    run: (model: string, input: unknown, options?: { returnRawResponse?: boolean }) => Promise<unknown>;
  };
};

export type PodcastRetrieveScope = ResearchScope & { tagMatch?: TagMatch };

export type PodcastKernelDeps = {
  retrieve: (
    query: string,
    scope?: ResearchScope,
    pageIds?: string[],
    limit?: number,
  ) => Promise<PodcastNote[]>;
  complete: (prompt: string) => Promise<string>;
  listEpisodes: () => Promise<PodcastEpisode[]>;
};

export type PodcastIndex = {
  episodes: unknown[];
  series: unknown[];
};

type PageRecord = PageBody & { updated_at?: string };

async function r2Text(env: PodcastKernelEnv, key: string) {
  const object = await env.ARCHIVE.get(key);
  return object ? object.text() : null;
}

async function r2Bytes(env: PodcastKernelEnv, key: string) {
  const object = await env.ARCHIVE.get(key);
  return object ? object.arrayBuffer() : null;
}

async function githubPage(env: PodcastKernelEnv, pageId: string): Promise<PageRecord | null> {
  if (!env.GITHUB_DATA_REPO || !env.GITHUB_DATA_REPO_TOKEN) return null;
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_DATA_REPO}/contents/pages/${pageId}.json`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_DATA_REPO_TOKEN}`,
      Accept: "application/vnd.github.raw",
    },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const page = (await response.json()) as PageRecord;
  return page.id ? page : null;
}

async function loadPage(env: PodcastKernelEnv, pageId: string): Promise<PageRecord | null> {
  return fetchPageBody(pageId, {
    fromR2: async id => {
      const raw = await r2Text(env, `research/pages/${id}.json`);
      return raw ? (JSON.parse(raw) as PageRecord) : null;
    },
    fromGitHub: id => githubPage(env, id),
  });
}

function filterCorpus<T extends { id?: string; pageId?: string }>(
  items: T[],
  allowed: Set<string>,
  idOf: (item: T) => string,
) {
  return items.filter(item => allowed.has(idOf(item)));
}

export async function retrievePodcastNotes(
  env: PodcastKernelEnv,
  query: string,
  scope?: PodcastRetrieveScope,
  pageIds?: string[],
  limit = 24,
): Promise<PodcastNote[]> {
  const corpus = await loadCorpusCached({
    text: key => r2Text(env, key),
    bytes: key => r2Bytes(env, key),
  });
  let manifest = corpus.manifest;
  let index = corpus.index;

  if (pageIds?.length) {
    const allowed = new Set(pageIds);
    manifest = filterCorpus(manifest, allowed, item => item.id);
    index = filterCorpus(index, allowed, item => item.pageId);
    if (!manifest.length) return [];
  }

  if (scope?.area || scope?.tags?.length) {
    manifest = applyPodcastScope(manifest, scope);
    const allowed = new Set(manifest.map(doc => doc.id));
    index = index.filter(entry => allowed.has(entry.pageId));
  }

  const queryVector = env.EMBEDDINGS_API_KEY ? await embedQuery(query, env.EMBEDDINGS_API_KEY) : null;
  const hits = hybridRetrieve({
    query,
    manifest,
    index,
    queryVector,
    k: Math.max(1, limit),
  });

  return Promise.all(
    hits.map(async hit => {
      const page = await loadPage(env, hit.pageId);
      return {
        pageId: hit.pageId,
        title: page?.title ?? hit.title,
        excerpt: page ? excerptFromBody(page.body) : hit.excerpt,
        ...(typeof page?.updated_at === "string" ? { updated_at: page.updated_at } : {}),
      };
    }),
  );
}

export async function completePrompt(env: PodcastKernelEnv, prompt: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`Anthropic timed out after ${Math.round(ANTHROPIC_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  return payload.content?.find(block => block.type === "text")?.text ?? "";
}

export async function readPodcastIndex(env: PodcastKernelEnv): Promise<PodcastIndex> {
  const raw = await r2Text(env, PODCAST_INDEX_KEY);
  if (!raw) return { episodes: [], series: [] };
  try {
    const parsed = JSON.parse(raw) as { episodes?: unknown; series?: unknown };
    return {
      episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
      series: Array.isArray(parsed.series) ? parsed.series : [],
    };
  } catch {
    return { episodes: [], series: [] };
  }
}

export async function loadPodcastEpisode(env: PodcastKernelEnv, id: string): Promise<PodcastEpisode | null> {
  const raw = await r2Text(env, podcastEpisodeKey(id));
  if (!raw) return null;
  try {
    const parsed = PodcastEpisodeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadPodcastSeries(env: PodcastKernelEnv, id: string): Promise<PodcastSeries | null> {
  const raw = await r2Text(env, podcastSeriesKey(id));
  if (!raw) return null;
  try {
    const parsed = PodcastSeriesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeIndex(env: PodcastKernelEnv, index: PodcastIndex) {
  await env.ARCHIVE.put(PODCAST_INDEX_KEY, JSON.stringify(index));
}

function itemId(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  return typeof value.id === "string" ? value.id : null;
}

export async function persistPodcastEpisode(env: PodcastKernelEnv, episode: PodcastEpisode) {
  await env.ARCHIVE.put(podcastEpisodeKey(episode.id), JSON.stringify(episode));
  const index = await readPodcastIndex(env);
  index.episodes = [...index.episodes.filter(item => itemId(item) !== episode.id), episode];
  await writeIndex(env, index);
}

export async function persistPodcastSeries(env: PodcastKernelEnv, series: PodcastSeries) {
  await env.ARCHIVE.put(podcastSeriesKey(series.id), JSON.stringify(series));
  const index = await readPodcastIndex(env);
  index.series = [...index.series.filter(item => itemId(item) !== series.id), series];
  await writeIndex(env, index);
}

export async function listPodcastEpisodes(env: PodcastKernelEnv): Promise<PodcastEpisode[]> {
  const index = await readPodcastIndex(env);
  const loaded = await Promise.all(
    index.episodes.map(async item => {
      const parsed = PodcastEpisodeSchema.safeParse(item);
      if (parsed.success) return parsed.data;
      const id = itemId(item);
      return id ? loadPodcastEpisode(env, id) : null;
    }),
  );
  return loaded.filter((episode): episode is PodcastEpisode => Boolean(episode));
}

export function podcastKernelDeps(env: PodcastKernelEnv): PodcastKernelDeps {
  return {
    retrieve: (query, scope, pageIds, limit) => retrievePodcastNotes(env, query, scope, pageIds, limit),
    complete: prompt => completePrompt(env, prompt),
    listEpisodes: () => listPodcastEpisodes(env),
  };
}

export function retrieveScopeForMode(
  mode: PodcastMode,
  scope: ResearchScope | undefined,
  modeDial: Record<string, string>,
): PodcastRetrieveScope | undefined {
  if (mode === "connector" && modeDial.clusterA && modeDial.clusterB) {
    return {
      ...connectorScope([modeDial.clusterA, modeDial.clusterB]),
      ...(scope?.area ? { area: scope.area } : {}),
    };
  }
  return scope;
}

export function parseEpisodeCommission(body: unknown): {
  mode: PodcastMode;
  scope?: ResearchScope;
  modeDial: Record<string, string>;
  dials: PodcastDials;
} {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const modeDial =
    value.modeDial && typeof value.modeDial === "object" && !Array.isArray(value.modeDial)
      ? Object.fromEntries(
          Object.entries(value.modeDial as Record<string, unknown>).flatMap(([key, item]) =>
            typeof item === "string" ? [[key, item]] : [],
          ),
        )
      : {};
  return {
    mode: PodcastModeSchema.parse(value.mode ?? "recap"),
    scope: parseResearchScope(value.scope),
    modeDial,
    dials: PodcastDialsSchema.parse(value.dials ?? {}),
  };
}

export function parseSeriesCommission(body: unknown): {
  topic: string;
  scope?: ResearchScope;
  episodeCount: number;
  cadence: "weekly" | "monthly" | "half-yearly" | "yearly";
  dials: PodcastDials;
} {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const topic = typeof value.topic === "string" ? value.topic.trim() : "";
  if (!topic) throw new Error("topic is required");
  const episodeCount = Number(value.episodeCount ?? 8);
  if (!Number.isInteger(episodeCount) || episodeCount < 3 || episodeCount > 12) {
    throw new Error("episodeCount must be an integer from 3 to 12");
  }
  const cadence = value.cadence;
  if (cadence !== "weekly" && cadence !== "monthly" && cadence !== "half-yearly" && cadence !== "yearly") {
    throw new Error("cadence is required");
  }
  return {
    topic,
    scope: parseResearchScope(value.scope),
    episodeCount,
    cadence,
    dials: PodcastDialsSchema.parse(value.dials ?? {}),
  };
}

export function isPodcastStatusError(value: unknown): value is { error: string; status: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string" &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "number"
  );
}
