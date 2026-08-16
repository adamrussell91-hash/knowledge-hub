import type { ResearchScope } from "../research/scope";
import { groundTurns } from "./ground";
import { pickMemories } from "./memory";
import { filterFourthWallTurns, podcastNaturalnessError } from "./naturalness";
import {
  PodcastEpisodeSchema,
  PodcastSeriesSchema,
  noteCap,
  turnCap,
  type PodcastDials,
  type PodcastEpisode,
  type PodcastMode,
  type PodcastSeries,
  type PodcastTurn,
  type SeriesSlot,
} from "./schema";
import { buildPodcastEditorPrompt, buildPodcastPrompt, parsePodcastScript } from "./script";
import { filterByUpdatedAt, recapCutoff, selectQuery } from "./select";
import { buildSeriesPlanPrompt, groundSeriesPlan, type RawSeriesPlan } from "./seriesPlan";

export type PodcastNote = {
  pageId: string;
  title: string;
  excerpt: string;
  updated_at?: string;
};

export type RunGenerateInput = {
  mode: PodcastMode;
  scope?: ResearchScope;
  modeDial: Record<string, string>;
  dials: PodcastDials;
  topic?: string;
  series?: {
    id: string;
    bible: { showTitle: string; openingRitual: string; vibe: string; runningMotifs: string[] };
    episodeIndex: number;
  };
  now?: number;
};

export type RunGenerateDeps = {
  retrieve: (
    query: string,
    scope?: ResearchScope,
    pageIds?: string[],
    limit?: number,
  ) => Promise<PodcastNote[]>;
  complete: (prompt: string) => Promise<string>;
  listEpisodes: () => Promise<PodcastEpisode[]>;
  id?: () => string;
  nowIso?: () => string;
};

const CADENCES = ["weekly", "monthly", "half-yearly", "yearly"] as const;
type RecapCadence = (typeof CADENCES)[number];

function asCadence(value: string | undefined): RecapCadence {
  return CADENCES.includes(value as RecapCadence) ? (value as RecapCadence) : "weekly";
}

function sameTags(left?: string[], right?: string[]) {
  const a = [...(left ?? [])].sort();
  const b = [...(right ?? [])].sort();
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function lastRecapAt(episodes: PodcastEpisode[], scope?: ResearchScope) {
  const matches = episodes
    .filter(episode => episode.mode === "recap" && sameTags(episode.scope?.tags, scope?.tags))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return matches[0]?.created_at;
}

function datedNotes(notes: PodcastNote[]) {
  return notes.filter((note): note is PodcastNote & { updated_at: string } => Boolean(note.updated_at));
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

function parseSeriesPlan(raw: string): RawSeriesPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("Series plan JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Series plan JSON is invalid");
  const value = parsed as Partial<RawSeriesPlan>;
  if (!Array.isArray(value.episodes)) throw new Error("Series plan JSON is invalid");
  return {
    showTitle: String(value.showTitle ?? ""),
    openingRitual: String(value.openingRitual ?? ""),
    vibe: String(value.vibe ?? ""),
    runningMotifs: Array.isArray(value.runningMotifs) ? value.runningMotifs.map(String) : [],
    episodes: value.episodes,
  };
}

function episodeBase(input: RunGenerateInput, deps: RunGenerateDeps) {
  return {
    id: deps.id?.() ?? crypto.randomUUID(),
    created_at: deps.nowIso?.() ?? new Date().toISOString(),
    mode: input.mode,
    scope: input.scope,
    modeDial: input.modeDial,
    dials: input.dials,
    memory: "",
    seriesId: input.series?.id,
    episodeIndex: input.series?.episodeIndex,
    showTitle: input.series?.bible.showTitle,
  };
}

export async function runGenerate(input: RunGenerateInput, deps: RunGenerateDeps): Promise<PodcastEpisode> {
  const query = selectQuery({
    mode: input.mode,
    scope: input.scope,
    modeDial: input.modeDial,
    topic: input.topic,
  });
  const episodes = await deps.listEpisodes();
  const noteLimit = noteCap(input.dials.length, input.dials.pacing);
  let notes = await deps.retrieve(query, input.scope, undefined, noteLimit);

  if (input.mode === "recap") {
    const cutoff = recapCutoff({
      cadence: asCadence(input.modeDial.cadence),
      lastRecapAt: lastRecapAt(episodes, input.scope),
      now: input.now ?? Date.now(),
    });
    notes = filterByUpdatedAt(datedNotes(notes), cutoff);
    if (!notes.length) {
      return PodcastEpisodeSchema.parse({
        ...episodeBase(input, deps),
        status: "ready",
        sourcePageIds: [],
        turns: [
          {
            id: crypto.randomUUID(),
            speaker: "clementine",
            kind: "empty",
            text: "Nothing new in the archive this period.",
            citations: [],
          },
        ],
      });
    }
  }

  notes = notes.slice(0, noteLimit);

  const memories = pickMemories({
    seriesId: input.series?.id,
    scopeTags: input.scope?.tags,
    episodes,
  });
  const promptInput = {
    mode: input.mode,
    dials: input.dials,
    modeDial: input.modeDial,
    notes,
    bible: input.series?.bible,
  };
  const draft = parsePodcastScript(
    await deps.complete(buildPodcastPrompt({ ...promptInput, memories })),
  );
  const edited = parsePodcastScript(
    await deps.complete(buildPodcastEditorPrompt({ ...promptInput, draft })),
  );
  const { kept } = groundTurns(
    edited,
    notes.map(note => ({ pageId: note.pageId, title: note.title })),
  );
  const turns = kept.slice(0, turnCap(input.dials.length));
  const naturalnessError = podcastNaturalnessError(turns);

  return PodcastEpisodeSchema.parse({
    ...episodeBase(input, deps),
    status: naturalnessError ? "error" : "running",
    sourcePageIds: notes.map(note => note.pageId),
    turns: naturalnessError ? [] : turns,
    error: naturalnessError ?? undefined,
  });
}

export async function runSeriesPlan(
  input: {
    topic: string;
    scope?: ResearchScope;
    episodeCount: number;
    cadence: RecapCadence;
    dials: PodcastDials;
  },
  deps: {
    retrieve: (
      query: string,
      scope?: ResearchScope,
      pageIds?: string[],
      limit?: number,
    ) => Promise<PodcastNote[]>;
    complete: (prompt: string) => Promise<string>;
    id?: () => string;
    nowIso?: () => string;
  },
): Promise<PodcastSeries | { error: string; status: 422 }> {
  const noteLimit = noteCap("deep", input.dials.pacing);
  const notes = (await deps.retrieve(input.topic, input.scope, undefined, noteLimit)).slice(0, noteLimit);
  const raw = parseSeriesPlan(await deps.complete(buildSeriesPlanPrompt(input.topic, notes, input.episodeCount)));
  const plan = groundSeriesPlan(raw, notes, input.episodeCount);
  if (!plan.ok) return { error: plan.gap, status: 422 };

  return PodcastSeriesSchema.parse({
    id: deps.id?.() ?? crypto.randomUUID(),
    created_at: deps.nowIso?.() ?? new Date().toISOString(),
    topic: input.topic,
    scope: input.scope,
    cadence: input.cadence,
    dials: input.dials,
    showTitle: plan.showTitle,
    openingRitual: plan.openingRitual,
    vibe: plan.vibe,
    runningMotifs: plan.runningMotifs,
    slots: plan.slots,
  });
}

export type NextSeriesSlotResult =
  | { ok: true; slot: SeriesSlot }
  | { ok: false; status: 409 | 422; error: string };

export function nextSeriesSlot(
  series: PodcastSeries,
  episodes: Readonly<Record<string, { status: string }>> = {},
): NextSeriesSlotResult {
  const slots = [...series.slots].sort((left, right) => left.index - right.index);
  const openIndex = slots.findIndex(slot => !slot.episodeId || !episodes[slot.episodeId]);
  if (openIndex < 0) {
    return { ok: false, status: 422, error: "No remaining slots in this series" };
  }
  if (openIndex > 0) {
    const previous = slots[openIndex - 1];
    const previousEpisode = previous?.episodeId ? episodes[previous.episodeId] : undefined;
    if (!previousEpisode || (previousEpisode.status !== "ready" && previousEpisode.status !== "cancelled")) {
      return { ok: false, status: 409, error: "Previous episode is still generating" };
    }
  }
  return { ok: true, slot: slots[openIndex]! };
}

export async function runNextEpisode(
  series: PodcastSeries,
  episodes: readonly PodcastEpisode[],
  deps: RunGenerateDeps,
): Promise<PodcastEpisode | { status: 409 | 422; error: string }> {
  const next = nextSeriesSlot(
    series,
    Object.fromEntries(episodes.map(episode => [episode.id, episode])),
  );
  if (!next.ok) return { status: next.status, error: next.error };
  return runGenerate(
    {
      mode: next.slot.mode,
      scope: series.scope,
      modeDial: { cadence: series.cadence },
      dials: series.dials,
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
    deps,
  );
}

export type RunFollowupDeps = {
  retrieve: (
    query: string,
    scope?: ResearchScope,
    pageIds?: string[],
    limit?: number,
  ) => Promise<PodcastNote[]>;
  complete: (prompt: string) => Promise<string>;
};

export type RunFollowupError = {
  status: 409 | 422;
  error: string;
};

const FOLLOWUP_NATURALNESS = [
  "This is spoken podcast dialogue: never address the requester by name and never discuss their draft, essay, paper, assignment, or writing.",
  "Reply directly to the listener question or quiz answer and react to the existing transcript.",
  "Paraphrase source names in speech; keep exact titles only in citation metadata.",
].join(" ");

function transcriptSnippet(turns: PodcastTurn[]) {
  return turns
    .slice(-8)
    .map(turn => `${turn.speaker ?? "cue"} (${turn.kind}): ${turn.text}`)
    .join("\n");
}

function noteLines(notes: PodcastNote[]) {
  return notes.map(note => `- ${note.pageId} "${note.title}": ${note.excerpt}`).join("\n") || "(none)";
}

async function retrieveForEpisode(
  episode: PodcastEpisode,
  query: string,
  retrieve: RunFollowupDeps["retrieve"],
) {
  const restricted = await retrieve(query, episode.scope, episode.sourcePageIds);
  if (restricted.length) return restricted;
  return retrieve(query, episode.scope);
}

function groundAgainstNotes(raw: string, notes: PodcastNote[]) {
  return groundTurns(
    parsePodcastScript(raw),
    notes.map(note => ({ pageId: note.pageId, title: note.title })),
  ).kept;
}

function spliceAfter(episode: PodcastEpisode, afterIndex: number, inserted: PodcastTurn[]) {
  const at = afterIndex < 0 ? episode.turns.length : afterIndex + 1;
  return PodcastEpisodeSchema.parse({
    ...episode,
    turns: [...episode.turns.slice(0, at), ...inserted, ...episode.turns.slice(at)],
  });
}

function buildInterruptPrompt(episode: PodcastEpisode, question: string, notes: PodcastNote[]) {
  return [
    "Both hosts may speak. Return 1-3 turns with kind interrupt. JSON only.",
    "Cite only the provided notes. Do not use the open web. Do not invent sources.",
    FOLLOWUP_NATURALNESS,
    `Question: ${question}`,
    `Notes:\n${noteLines(notes)}`,
    `Transcript snippet:\n${transcriptSnippet(episode.turns)}`,
  ].join("\n\n");
}

function buildQuizAnswerPrompt(
  episode: PodcastEpisode,
  quiz: PodcastTurn,
  text: string,
  notes: PodcastNote[],
) {
  return [
    "The listener answered a quiz prompt. Return 1 turn: kind model-answer or a short host reaction.",
    "JSON only. Cite only the provided notes. Do not use the open web.",
    FOLLOWUP_NATURALNESS,
    `Quiz prompt: ${quiz.text}`,
    `Listener answer: ${text}`,
    `Notes:\n${noteLines(notes)}`,
    `Transcript snippet:\n${transcriptSnippet(episode.turns)}`,
  ].join("\n\n");
}

function naturalFollowupOrError(grounded: PodcastTurn[]): PodcastTurn[] | RunFollowupError {
  const natural = filterFourthWallTurns(grounded);
  if (grounded.length > 0 && natural.length === 0) {
    return { status: 422, error: "Podcast follow-up broke the fourth wall" };
  }
  return natural;
}

export async function runInterrupt(
  episode: PodcastEpisode,
  input: { afterTurn: string; question: string },
  deps: RunFollowupDeps,
): Promise<PodcastEpisode | RunFollowupError> {
  if (episode.status === "running") {
    return { status: 409, error: "still generating" };
  }

  const notes = await retrieveForEpisode(episode, input.question, deps.retrieve);
  const grounded = groundAgainstNotes(
    await deps.complete(buildInterruptPrompt(episode, input.question, notes)),
    notes,
  );
  const natural = naturalFollowupOrError(grounded);
  if (!Array.isArray(natural)) return natural;
  const afterIndex = episode.turns.findIndex(turn => turn.id === input.afterTurn);
  return spliceAfter(episode, afterIndex, natural);
}

export async function runQuizAnswer(
  episode: PodcastEpisode,
  input: { afterTurn: string; text: string },
  deps: RunFollowupDeps,
): Promise<PodcastEpisode | RunFollowupError> {
  const start = episode.turns.findIndex(turn => turn.id === input.afterTurn);
  const from = start < 0 ? 0 : start;
  const quizIndex = episode.turns.findIndex((turn, index) => index >= from && turn.kind === "quiz-prompt");
  if (quizIndex < 0) return episode;

  const quiz = episode.turns[quizIndex]!;
  const notes = await retrieveForEpisode(episode, input.text, deps.retrieve);
  const grounded = groundAgainstNotes(
    await deps.complete(buildQuizAnswerPrompt(episode, quiz, input.text, notes)),
    notes,
  );
  const natural = naturalFollowupOrError(grounded);
  if (!Array.isArray(natural)) return natural;
  return spliceAfter(episode, quizIndex, natural);
}
