import { PodcastEpisodeSchema, type PodcastEpisode, type PodcastTurn } from "./schema";

export const VOICE_BY_SPEAKER = { clementine: "athena", ann: "luna" } as const;

export function needsAudio(turn: PodcastTurn) {
  return Boolean(turn.speaker && turn.text.trim() && turn.kind !== "cue" && turn.kind !== "empty" && !turn.audioKey);
}

export async function speakTurns(
  turns: PodcastTurn[],
  episodeId: string,
  deps: {
    tts: (input: { text: string; voice: string }) => Promise<ArrayBuffer>;
    put: (key: string, bytes: ArrayBuffer) => Promise<void>;
  },
) {
  const next = [];
  for (const turn of turns) {
    if (turn.kind === "cue" || turn.kind === "empty" || !turn.speaker || !turn.text.trim()) {
      next.push(turn);
      continue;
    }
    const key = `podcast/audio/${episodeId}/${turn.id}`;
    let bytes: ArrayBuffer | null = null;
    for (let attempt = 0; attempt < 2 && !bytes; attempt++) {
      try {
        bytes = await deps.tts({ text: turn.text, voice: VOICE_BY_SPEAKER[turn.speaker] });
      } catch {
        bytes = null;
      }
    }
    if (bytes) {
      await deps.put(key, bytes);
      next.push({ ...turn, audioKey: key });
    } else next.push(turn);
  }
  return next;
}

export function markEpisodeRecording(episode: PodcastEpisode): PodcastEpisode {
  if (!episode.turns.some(needsAudio)) return episode;
  return PodcastEpisodeSchema.parse({ ...episode, status: "running" });
}

export async function speakPendingTurns(
  episode: PodcastEpisode,
  deps: {
    tts?: (input: { text: string; voice: string }) => Promise<ArrayBuffer>;
    put: (key: string, bytes: ArrayBuffer) => Promise<void>;
  },
): Promise<PodcastEpisode> {
  if (!deps.tts) return episode;
  const pending = episode.turns.filter(needsAudio);
  if (!pending.length) return episode;
  const spoken = await speakTurns(pending, episode.id, { tts: deps.tts, put: deps.put });
  const byId = new Map(spoken.map(turn => [turn.id, turn]));
  return PodcastEpisodeSchema.parse({
    ...episode,
    turns: episode.turns.map(turn => byId.get(turn.id) ?? turn),
  });
}
