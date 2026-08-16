import { assembleClementinePrompt } from "../clementine/assemble";
import { clementinePodcast, voice } from "../clementine/pack";
import { PodcastModeSchema, SeriesSlotSchema, type PodcastMode } from "./schema";
import type { z } from "zod";

export type SeriesPlanNote = { pageId: string; title: string };

export type RawSeriesEpisode = {
  index: number;
  title: string;
  throughLine: string;
  mode: string;
  sourcePageIds: string[];
};

export type RawSeriesPlan = {
  showTitle: string;
  openingRitual: string;
  vibe: string;
  runningMotifs: string[];
  episodes: RawSeriesEpisode[];
};

type SeriesSlot = z.infer<typeof SeriesSlotSchema>;

export type GroundedSeriesPlan =
  | {
      ok: true;
      showTitle: string;
      openingRitual: string;
      vibe: string;
      runningMotifs: string[];
      slots: SeriesSlot[];
    }
  | { ok: false; gap: string };

const VALID_MODES = new Set<PodcastMode>(PodcastModeSchema.options);

function isValidMode(mode: string): mode is PodcastMode {
  return VALID_MODES.has(mode as PodcastMode);
}

export function groundSeriesPlan(
  raw: RawSeriesPlan,
  notes: SeriesPlanNote[],
  requestedCount: number,
): GroundedSeriesPlan {
  const allowed = new Set(notes.map((note) => note.pageId));

  const honest = raw.episodes.filter((episode) => {
    if (!episode.sourcePageIds.length) return false;
    if (!isValidMode(episode.mode)) return false;
    return episode.sourcePageIds.every((pageId) => allowed.has(pageId));
  });

  const cap = Math.min(requestedCount, 12);
  const slots = honest.slice(0, cap).map((episode, index) => ({
    index: index + 1,
    title: episode.title,
    throughLine: episode.throughLine,
    mode: episode.mode,
    sourcePageIds: episode.sourcePageIds,
  }));

  if (slots.length < 3) {
    return {
      ok: false,
      gap: `Only ${slots.length} episode slot${slots.length === 1 ? "" : "s"} could be grounded from the retrieved notes; need at least 3.`,
    };
  }

  return {
    ok: true,
    showTitle: raw.showTitle,
    openingRitual: raw.openingRitual,
    vibe: raw.vibe,
    runningMotifs: raw.runningMotifs,
    slots,
  };
}

export function buildSeriesPlanPrompt(
  topic: string,
  notes: SeriesPlanNote[],
  episodeCount: number,
): string {
  const surface = [
    "Plan a podcast series from archive notes only.",
    "Do not use the open web. Do not invent sources or page ids.",
    "Return only JSON. JSON-only. Do not wrap the response in markdown.",
    "Return a bible (showTitle, openingRitual, vibe, runningMotifs) and episodes (array of { index, title, throughLine, mode, sourcePageIds }).",
    "Each episode mode must be recap, connector, quiz, or debate.",
    "Every sourcePageId must come from the notes listed below.",
    "Do not pad with filler episodes if the notes cannot honestly support the requested count.",
  ].join(" ");

  const noteList = notes.map((note) => `- ${note.pageId} "${note.title}"`).join("\n");

  return assembleClementinePrompt({
    voice,
    job: clementinePodcast,
    surface,
    payload: [
      `Topic: ${topic}`,
      `Requested episode count: ${episodeCount}`,
      `Notes:\n${noteList || "(none)"}`,
    ].join("\n\n"),
  });
}
