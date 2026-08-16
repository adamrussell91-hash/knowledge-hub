import {
  isPodcastStatusError,
  loadPodcastEpisode,
  loadPodcastSeries,
  persistPodcastEpisode,
  persistPodcastSeries,
  podcastKernelDeps,
  readPodcastIndex,
  type PodcastKernelEnv,
} from "../../src/podcast/kernel";
import { handlePodcastRequest } from "../../src/podcast/http";
import { runInterrupt, runQuizAnswer } from "../../src/podcast/run";
import { markEpisodeRecording } from "../../src/podcast/speak";
import { isStalledEpisode, markStalledEpisode } from "../../src/podcast/stall";
import { startEpisodeOnDo, startNextOnDo, startSeriesOnDo } from "../../src/podcast/start";
import {
  PodcastEpisodeSchema,
  PodcastSeriesSchema,
  type PodcastEpisode,
  type PodcastSeries,
} from "../../src/podcast/schema";
import { handleCaptureRequest } from "../../src/capture/http";
import { liveExtract } from "../../src/capture/live";
import { handleResearchRequest } from "../../src/research/http";
import { runQuickKernel } from "../../src/research/kernel";
import { PodcastSession } from "./podcastSession";
import { ResearchSession, type ResearchEnv } from "./researchSession";

export { PodcastSession, ResearchSession };

type WorkerEnv = ResearchEnv &
  PodcastKernelEnv & {
    PODCAST_SESSION: DurableObjectNamespace;
  };

function podcastStub(env: WorkerEnv, id: string) {
  return env.PODCAST_SESSION.get(env.PODCAST_SESSION.idFromName(id));
}

async function storeOnDo(env: WorkerEnv, id: string, body: unknown) {
  const stub = podcastStub(env, id);
  const response = await stub.fetch(
    new Request("https://session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) throw new Error(`Podcast persist failed ${response.status}`);
  return response.json();
}

async function getStoredJson(env: WorkerEnv, id: string) {
  const stub = podcastStub(env, id);
  const response = await stub.fetch(new Request("https://session/"));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Podcast get failed ${response.status}`);
  return response.json();
}

async function saveEpisode(env: WorkerEnv, episode: PodcastEpisode) {
  await persistPodcastEpisode(env, episode);
  await storeOnDo(env, episode.id, episode);
  return episode;
}

async function getEpisode(env: WorkerEnv, id: string): Promise<PodcastEpisode | null> {
  const fromR2 = await loadPodcastEpisode(env, id);
  const episode = fromR2 ?? PodcastEpisodeSchema.safeParse(await getStoredJson(env, id)).data ?? null;
  if (!episode) return null;
  if (!isStalledEpisode(episode, Date.now())) return episode;
  const stalled = markStalledEpisode(episode);
  await persistPodcastEpisode(env, stalled);
  return stalled;
}

async function getSeries(env: WorkerEnv, id: string): Promise<PodcastSeries | null> {
  const fromR2 = await loadPodcastSeries(env, id);
  if (fromR2) return fromR2;
  const stored = await getStoredJson(env, `series:${id}`);
  const parsed = PodcastSeriesSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

async function startEpisode(env: WorkerEnv, body: unknown) {
  return startEpisodeOnDo(body, {
    persist: episode => persistPodcastEpisode(env, episode),
    startSession: (id, payload) => storeOnDo(env, id, payload).then(() => undefined),
  });
}

async function startSeries(env: WorkerEnv, body: unknown) {
  return startSeriesOnDo(body, {
    persistEpisode: episode => persistPodcastEpisode(env, episode),
    persistSeries: async series => {
      await persistPodcastSeries(env, series);
      await storeOnDo(env, `series:${series.id}`, { ...series, kind: "series" });
    },
    startSession: (id, payload) => storeOnDo(env, id, payload).then(() => undefined),
  });
}

async function nextInSeries(env: WorkerEnv, seriesId: string) {
  const series = await getSeries(env, seriesId);
  if (!series) return { error: "Unknown series", status: 404 };
  return startNextOnDo(series, await podcastKernelDeps(env).listEpisodes(), {
    persistEpisode: episode => persistPodcastEpisode(env, episode),
    persistSeries: async next => {
      await persistPodcastSeries(env, next);
      await storeOnDo(env, `series:${next.id}`, { ...next, kind: "series" });
    },
    startSession: (id, payload) => storeOnDo(env, id, payload).then(() => undefined),
  });
}

function followupInput(body: unknown, key: "question" | "text") {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    afterTurn: typeof value.afterTurn === "string" ? value.afterTurn : "",
    [key]: typeof value[key] === "string" ? value[key] : "",
  };
}

async function interruptEpisode(env: WorkerEnv, id: string, body: unknown) {
  const episode = await getEpisode(env, id);
  if (!episode) return { error: "Unknown episode", status: 404 };
  const result = await runInterrupt(
    episode,
    followupInput(body, "question") as { afterTurn: string; question: string },
    podcastKernelDeps(env),
  );
  if (isPodcastStatusError(result)) return result;
  return saveEpisode(env, markEpisodeRecording(result));
}

async function answerEpisode(env: WorkerEnv, id: string, body: unknown) {
  const episode = await getEpisode(env, id);
  if (!episode) return { error: "Unknown episode", status: 404 };
  if (episode.status === "running") return { error: "still generating", status: 409 };
  const result = await runQuizAnswer(
    episode,
    followupInput(body, "text") as { afterTurn: string; text: string },
    podcastKernelDeps(env),
  );
  return saveEpisode(env, markEpisodeRecording(result));
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const path = pathname.replace(/\/+$/, "") || "/";
    if (path.endsWith("/capture")) {
      return handleCaptureRequest(request, {
        secret: env.RESEARCH_KERNEL_SHARED_SECRET,
        allowedOrigin: env.TEACHING_HUB_ORIGIN ?? "*",
        extract: liveExtract(env),
      });
    }
    if (pathname.includes("/podcast")) {
      return handlePodcastRequest(request, {
        secret: env.RESEARCH_KERNEL_SHARED_SECRET,
        allowedOrigin: env.TEACHING_HUB_ORIGIN ?? "*",
        startEpisode: body => startEpisode(env, body),
        startSeries: body => startSeries(env, body),
        nextInSeries: seriesId => nextInSeries(env, seriesId),
        getEpisode: id => getEpisode(env, id),
        getSeries: id => getSeries(env, id),
        listIndex: () => readPodcastIndex(env),
        interrupt: (id, body) => interruptEpisode(env, id, body),
        answer: (id, body) => answerEpisode(env, id, body),
      });
    }

    return handleResearchRequest(request, {
      secret: env.RESEARCH_KERNEL_SHARED_SECRET,
      allowedOrigin: env.TEACHING_HUB_ORIGIN ?? "*",
      runQuick: input => runQuickKernel(input, env),
      startDeep: async input => {
        const sessionId = crypto.randomUUID();
        const stub = env.RESEARCH_SESSION.get(env.RESEARCH_SESSION.idFromName(sessionId));
        const response = await stub.fetch(
          new Request("https://session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, ...input }),
          }),
        );
        if (!response.ok) throw new Error(`Session start failed ${response.status}`);
        return response.json();
      },
      getDeep: async sessionId => {
        const stub = env.RESEARCH_SESSION.get(env.RESEARCH_SESSION.idFromName(sessionId));
        const response = await stub.fetch(new Request("https://session/"));
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Session get failed ${response.status}`);
        return response.json();
      },
      cancelDeep: async sessionId => {
        const stub = env.RESEARCH_SESSION.get(env.RESEARCH_SESSION.idFromName(sessionId));
        const response = await stub.fetch(new Request("https://session/cancel", { method: "POST" }));
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Session cancel failed ${response.status}`);
        return response.json();
      },
    });
  },
};
