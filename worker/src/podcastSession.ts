import { runAuraTts } from "../../src/podcast/aura";
import {
  isPodcastStatusError,
  persistPodcastEpisode,
  persistPodcastSeries,
  podcastKernelDeps,
  type PodcastKernelEnv,
} from "../../src/podcast/kernel";
import { runGenerate, runNextEpisode, runSeriesPlan } from "../../src/podcast/run";
import { PodcastEpisodeSchema, type PodcastEpisode } from "../../src/podcast/schema";
import { needsAudio, speakTurns } from "../../src/podcast/speak";
import {
  generateInputFromCommission,
  withSlotEpisode,
  type EpisodeCommission,
  type GenerateExtras,
  type SeriesCommission,
  type StartSessionPayload,
} from "../../src/podcast/start";

const TTS_BATCH = 8;
const ALARM_DELAY_MS = 250;
const GENERATE_TIMEOUT_MS = 210_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isSeriesBody(body: Record<string, unknown>) {
  return body.kind === "series" || Array.isArray(body.slots);
}

function isWrappedStart(body: Record<string, unknown>): body is StartSessionPayload & Record<string, unknown> {
  return Boolean(body.episode && typeof body.episode === "object");
}

function capWords(text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= max ? text.trim() : words.slice(0, max).join(" ");
}

async function writeMemory(episode: PodcastEpisode, complete: (prompt: string) => Promise<string>) {
  const transcript = episode.turns.map(turn => `${turn.speaker ?? "cue"}: ${turn.text}`).join("\n");
  try {
    const raw = await complete(
      [
        "Write a memory of this podcast episode in at most 200 words.",
        "Use only the transcript. Do not add new claims, sources, or facts.",
        "Return plain text, not JSON.",
        `Transcript:\n${transcript || "(empty)"}`,
      ].join("\n\n"),
    );
    return capWords(raw, 200);
  } catch {
    return "";
  }
}

export class PodcastSession {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: PodcastKernelEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/start")) {
      const body = (await request.json()) as Record<string, unknown>;
      if (isSeriesBody(body) && !isWrappedStart(body)) {
        await this.ctx.storage.put("series", body);
        return Response.json(body);
      }
      if (isWrappedStart(body)) {
        if (body.commission) await this.ctx.storage.put("commission", body.commission);
        if (body.seriesCommission) await this.ctx.storage.put("seriesCommission", body.seriesCommission);
        if (body.series) await this.ctx.storage.put("series", body.series);
        if (body.generate) await this.ctx.storage.put("generate", body.generate);
        await this.ctx.storage.put("episode", body.episode);
        const parsed = PodcastEpisodeSchema.safeParse(body.episode);
        if (parsed.success && (parsed.data.status === "running" || parsed.data.turns.some(needsAudio))) {
          await this.ctx.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
        }
        return Response.json(body.episode);
      }
      const episode = { ...body, id: body.episodeId ?? body.id };
      await this.ctx.storage.put("episode", episode);
      const parsed = PodcastEpisodeSchema.safeParse(episode);
      if (parsed.success && (parsed.data.status === "running" || parsed.data.turns.some(needsAudio))) {
        await this.ctx.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
      }
      return Response.json(episode);
    }

    if (request.method === "GET") {
      const episode = await this.ctx.storage.get<Record<string, unknown>>("episode");
      if (episode) return Response.json(episode);
      const series = await this.ctx.storage.get<Record<string, unknown>>("series");
      if (series) return Response.json(series);
      return Response.json({ error: "Unknown episode" }, { status: 404 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async alarm() {
    const stored = await this.ctx.storage.get<unknown>("episode");
    if (!stored) return;
    const parsed = PodcastEpisodeSchema.safeParse(stored);
    if (!parsed.success) return;
    let episode = parsed.data;
    const deps = podcastKernelDeps(this.env);

    if (episode.status === "running" && episode.turns.length === 0) {
      try {
        episode = await withTimeout(
          this.generateTurns(episode),
          GENERATE_TIMEOUT_MS,
          `Script timed out after ${Math.round(GENERATE_TIMEOUT_MS / 1000)}s`,
        );
      } catch (error) {
        episode = PodcastEpisodeSchema.parse({
          ...episode,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await this.save(episode);
      if (episode.status === "error") return;
    }

    episode = await this.speakBatch(episode);
    if (this.env.AI && episode.turns.some(needsAudio)) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_DELAY_MS);
      return;
    }

    if (episode.status === "error") {
      await this.save(episode);
      return;
    }

    episode = PodcastEpisodeSchema.parse({
      ...episode,
      memory: await writeMemory(episode, deps.complete),
      status: "ready",
    });
    await this.save(episode);
  }

  private async generateTurns(episode: PodcastEpisode): Promise<PodcastEpisode> {
    const deps = podcastKernelDeps(this.env);
    const locked = {
      ...deps,
      id: () => episode.id,
      nowIso: () => episode.created_at,
    };
    try {
      const seriesCommission = await this.ctx.storage.get<SeriesCommission>("seriesCommission");
      if (seriesCommission) {
        const planned = await runSeriesPlan(seriesCommission, {
          ...locked,
          id: () => episode.seriesId ?? episode.id,
        });
        if (isPodcastStatusError(planned)) {
          return PodcastEpisodeSchema.parse({ ...episode, status: "error", error: planned.error });
        }
        const generated = await runNextEpisode(planned, [], locked);
        if (isPodcastStatusError(generated)) {
          return PodcastEpisodeSchema.parse({ ...episode, status: "error", error: generated.error });
        }
        const series = withSlotEpisode(planned, generated);
        await persistPodcastSeries(this.env, series);
        await this.ctx.storage.put("series", { ...series, kind: "series" });
        return generated;
      }
      const commission = await this.ctx.storage.get<EpisodeCommission>("commission");
      if (!commission) return episode;
      const extras = (await this.ctx.storage.get<GenerateExtras>("generate")) ?? {};
      return runGenerate({ ...generateInputFromCommission(commission), ...extras }, locked);
    } catch (error) {
      return PodcastEpisodeSchema.parse({
        ...episode,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async speakBatch(episode: PodcastEpisode): Promise<PodcastEpisode> {
    const ai = this.env.AI;
    if (!ai || typeof ai.run !== "function") return episode;
    const pending = episode.turns.filter(needsAudio).slice(0, TTS_BATCH);
    if (!pending.length) return episode;
    const spoken = await speakTurns(pending, episode.id, {
      tts: input => runAuraTts(ai, input),
      put: async (key, bytes) => {
        await this.env.ARCHIVE.put(key, bytes);
      },
    });
    const byId = new Map(spoken.map(turn => [turn.id, turn]));
    const next = PodcastEpisodeSchema.parse({
      ...episode,
      turns: episode.turns.map(turn => byId.get(turn.id) ?? turn),
    });
    await this.save(next);
    return next;
  }

  private async save(episode: PodcastEpisode) {
    const stamped = PodcastEpisodeSchema.parse({ ...episode, progress_at: new Date().toISOString() });
    await this.ctx.storage.put("episode", stamped);
    await persistPodcastEpisode(this.env, stamped);
  }
}
