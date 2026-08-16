import { PodcastEpisodeSchema, type PodcastEpisode } from "./schema";

export const STALL_LIMIT_MS = 4 * 60 * 1000;

export function lastProgressMs(episode: PodcastEpisode): number {
  const stamp = Date.parse(episode.progress_at ?? episode.created_at);
  return Number.isNaN(stamp) ? 0 : stamp;
}

export function isStalledEpisode(episode: PodcastEpisode, nowMs: number, limitMs = STALL_LIMIT_MS) {
  if (episode.status !== "running") return false;
  const last = lastProgressMs(episode);
  if (!last) return false;
  return nowMs - last > limitMs;
}

export function markStalledEpisode(episode: PodcastEpisode, limitMs = STALL_LIMIT_MS): PodcastEpisode {
  const stage = episode.turns.length ? "recording audio" : "writing the script";
  const minutes = Math.max(1, Math.round(limitMs / 60_000));
  return PodcastEpisodeSchema.parse({
    ...episode,
    status: "error",
    error: `Recording stopped: nothing progressed for over ${minutes} minutes while ${stage}.`,
  });
}
