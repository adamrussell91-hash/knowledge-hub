import { z } from "zod";
import { assembleClementinePrompt } from "../clementine/assemble";
import { annotationVoice, clementinePodcast, voice } from "../clementine/pack";
import { PodcastTurnSchema, turnCap, type PodcastDials, type PodcastMode, type PodcastTurn } from "./schema";

export type PodcastScriptNote = {
  pageId: string;
  title: string;
  excerpt: string;
};

export type PodcastBible = {
  showTitle: string;
  openingRitual: string;
  vibe: string;
  runningMotifs: string[];
};

export function buildPodcastPrompt(input: {
  mode: PodcastMode;
  dials: PodcastDials;
  modeDial: Record<string, string>;
  notes: PodcastScriptNote[];
  memories: string[];
  bible?: PodcastBible;
}): string {
  const surface = [
    "This is a two-host podcast. Professor Clementine Haig and Ann O’Tation speak from archive notes only.",
    "Do not use the open web. Do not invent sources.",
    "Ann is a co-host close-reading the notes as texts, not a lesson mentor in this surface.",
    "Return only JSON. JSON-only. Do not wrap the response in markdown.",
    "Each turn must include: id, speaker (clementine | ann), kind (content | banter | quiz-prompt | model-answer | interrupt | cue | empty), text, citations (array of { pageId, title, sourceUrl? }).",
    `Write at most ${turnCap(input.dials.length)} turns. Turns past that are discarded.`,
  ].join(" ");

  const notes = input.notes
    .map(note => `- ${note.pageId} "${note.title}": ${note.excerpt}`)
    .join("\n");
  const memories = input.memories.length
    ? `Previous shows (not citable):\n${input.memories.map(memory => `- ${memory}`).join("\n")}`
    : "Previous shows: none.";
  const bible = input.bible
    ? [
        "Series bible:",
        `showTitle: ${input.bible.showTitle}`,
        `openingRitual: ${input.bible.openingRitual}`,
        `vibe: ${input.bible.vibe}`,
        `runningMotifs: ${input.bible.runningMotifs.join("; ") || "(none)"}`,
        "Honour openingRitual on turn 1 so this sounds like the same programme.",
      ].join("\n")
    : "";

  return assembleClementinePrompt({
    voice,
    job: clementinePodcast,
    surface: [annotationVoice, surface].join("\n\n"),
    payload: [
      `Mode: ${input.mode}`,
      `Mode dials: ${JSON.stringify(input.modeDial)}`,
      `Dials: ${JSON.stringify(input.dials)}`,
      `Notes:\n${notes || "(none)"}`,
      memories,
      bible,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}

const ScriptSchema = z.object({
  turns: z.array(PodcastTurnSchema),
});

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

export function parsePodcastScript(raw: string): PodcastTurn[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("Podcast script JSON is invalid");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { turns?: unknown }).turns)) {
    throw new Error("Podcast script JSON is invalid");
  }

  const withIds = {
    turns: (parsed as { turns: Array<Record<string, unknown>> }).turns.map(turn => ({
      ...turn,
      id: typeof turn.id === "string" && turn.id ? turn.id : crypto.randomUUID(),
    })),
  };

  return ScriptSchema.parse(withIds).turns;
}
