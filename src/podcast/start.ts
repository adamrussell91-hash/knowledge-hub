import {
  parseEpisodeCommission,
  parseSeriesCommission,
  retrieveScopeForMode,
} from "./kernel";
import { nextSeriesSlot } from "./run";
import { nextSeriesSlot } from "./run";
import {
  PodcastEpisodeSchema,
  PodcastSeriesSchema,
  type PodcastEpisode,
  type PodcastSeries,
} from "./schema";

export type EpisodeCommission = ReturnType<typeof parseEpisodeCommission>;
export type SeriesCommission = ReturnType<typeof parseSeriesCommission>;

export function runningEpisodeStub(input: {
  id: string;
  created_at: string;
  commission: EpisodeCommission;
  seriesId?: string;
  episodeIndex?: number;
  showTitle?: string;
}): PodcastEpisode {
  return PodcastEpisodeSchema.parse({
    id: input.id,
    created_at: input.created_at,
    status: "running",
    mode: input.commission.mode,
    scope: input.commission.scope,
    modeDial: input.commission.modeDial,
    dials: input.commission.dials,
    sourcePageIds: [],
    turns: [],
    memory: "",
    seriesId: input.seriesId,
    episodeIndex: input.episodeIndex,
    showTitle: input.showTitle,
  });
}

export function planningSeriesStub(input: {
  id: string;
  created_at: string;
  commission: SeriesCommission;
  episodeId: string;
}): PodcastSeries {
  return PodcastSeriesSchema.parse({
    id: input.id,
    created_at: input.created_at,
    topic: input.commission.topic,
    scope: input.commission.scope,
    cadence: input.commission.cadence,
    dials: input.commission.dials,
    showTitle: input.commission.topic,
    openingRitual: "Planning the season.",
    vibe: "Planning the season.",
    runningMotifs: [],
    slots: Array.from({ length: input.commission.episodeCount }, (_, index) => ({
      index: index + 1,
      title: `Episode ${index + 1}`,
      throughLine: input.commission.topic,
      mode: "recap" as const,
      sourcePageIds: [],
      ...(index === 0 ? { episodeId: input.episodeId } : {}),
    })),
  });
}

export function withSlotEpisode(series: PodcastSeries, episode: PodcastEpisode): PodcastSeries {
  return PodcastSeriesSchema.parse({
    ...series,
    slots: series.slots.map(slot =>
      slot.index === episode.episodeIndex ? { ...slot, episodeId: episode.id } : slot,
    ),
  });
}

export function generateInputFromCommission(commission: EpisodeCommission) {
  return {
    ...commission,
    scope: retrieveScopeForMode(commission.mode, commission.scope, commission.modeDial),
  };
}

export type GenerateExtras = {
  topic?: string;
  series?: {
    id: string;
    bible: { showTitle: string; openingRitual: string; vibe: string; runningMotifs: string[] };
    episodeIndex: number;
  };
};

export type StartSessionPayload = {
  episode: PodcastEpisode;
  commission?: EpisodeCommission;
  seriesCommission?: SeriesCommission;
  series?: PodcastSeries;
  generate?: GenerateExtras;
};

export async function startEpisodeOnDo(
  body: unknown,
  deps: {
    persist: (episode: PodcastEpisode) => Promise<void>;
    startSession: (id: string, payload: StartSessionPayload) => Promise<void>;
    id?: () => string;
    nowIso?: () => string;
  },
): Promise<PodcastEpisode> {
  const commission = parseEpisodeCommission(body);
  const episode = runningEpisodeStub({
    id: deps.id?.() ?? crypto.randomUUID(),
    created_at: deps.nowIso?.() ?? new Date().toISOString(),
    commission,
  });
  await deps.persist(episode);
  await deps.startSession(episode.id, { episode, commission });
  return episode;
}

export async function startSeriesOnDo(
  body: unknown,
  deps: {
    persistEpisode: (episode: PodcastEpisode) => Promise<void>;
    persistSeries: (series: PodcastSeries) => Promise<void>;
    startSession: (id: string, payload: StartSessionPayload) => Promise<void>;
    id?: () => string;
    seriesId?: () => string;
    nowIso?: () => string;
  },
): Promise<{ series: PodcastSeries; episode: PodcastEpisode }> {
  const commission = parseSeriesCommission(body);
  const created_at = deps.nowIso?.() ?? new Date().toISOString();
  const seriesId = deps.seriesId?.() ?? crypto.randomUUID();
  const episodeId = deps.id?.() ?? crypto.randomUUID();
  const episode = runningEpisodeStub({
    id: episodeId,
    created_at,
    commission: {
      mode: "recap",
      scope: commission.scope,
      modeDial: { cadence: commission.cadence },
      dials: commission.dials,
    },
    seriesId,
    episodeIndex: 1,
    showTitle: commission.topic,
  });
  const series = planningSeriesStub({
    id: seriesId,
    created_at,
    commission,
    episodeId,
  });
  await deps.persistEpisode(episode);
  await deps.persistSeries(series);
  await deps.startSession(episode.id, { episode, seriesCommission: commission, series });
  return { series, episode };
}

export async function startNextOnDo(
  series: PodcastSeries,
  episodes: readonly PodcastEpisode[],
  deps: {
    persistEpisode: (episode: PodcastEpisode) => Promise<void>;
    persistSeries: (series: PodcastSeries) => Promise<void>;
    startSession: (id: string, payload: StartSessionPayload) => Promise<void>;
    id?: () => string;
    nowIso?: () => string;
  },
): Promise<PodcastEpisode | { error: string; status: number }> {
  const next = nextSeriesSlot(
    series,
    Object.fromEntries(episodes.map(episode => [episode.id, episode])),
  );
  if (!next.ok) return { status: next.status, error: next.error };
  const commission: EpisodeCommission = {
    mode: next.slot.mode,
    scope: series.scope,
    modeDial: { cadence: series.cadence },
    dials: series.dials,
  };
  const episode = runningEpisodeStub({
    id: deps.id?.() ?? crypto.randomUUID(),
    created_at: deps.nowIso?.() ?? new Date().toISOString(),
    commission,
    seriesId: series.id,
    episodeIndex: next.slot.index,
    showTitle: series.showTitle,
  });
  const updated = withSlotEpisode(series, episode);
  await deps.persistEpisode(episode);
  await deps.persistSeries(updated);
  await deps.startSession(episode.id, {
    episode,
    commission,
    generate: {
      topic: next.slot.throughLine,
      series: {
        id: series.id,
        bible: {
          showTitle: series.showTitle,
          openingRitual: series.openingRitual,
          vibe: series.vibe,
          runningMotifs: series.runningMotifs,
        },
        episodeIndex: next.slot.index,
      },
    },
  });
  return episode;
}
