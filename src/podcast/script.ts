import { z } from "zod";
import { assembleClementinePrompt } from "../clementine/assemble";
import { annPodcast, clementinePodcast, podcastEditor } from "../clementine/pack";
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

const PODCAST_VOICE =
  "You are Professor Clementine Haig, co-hosting an archive-grounded podcast with Ann O’Tation.";

const EDITOR_SURFACE =
  "This is the mandatory editorial pass. Preserve valid turn kinds and citations.";

export type PodcastPromptInput = {
  mode: PodcastMode;
  dials: PodcastDials;
  modeDial: Record<string, string>;
  notes: PodcastScriptNote[];
  bible?: PodcastBible;
};

export type PodcastWriterPromptInput = PodcastPromptInput & {
  memories: string[];
};

function noteLines(notes: PodcastScriptNote[]): string {
  return notes.map(note => `- ${note.pageId} "${note.title}": ${note.excerpt}`).join("\n");
}

function bibleLines(bible?: PodcastBible): string {
  if (!bible) return "";
  return [
    "Series bible:",
    `showTitle: ${bible.showTitle}`,
    `openingRitual: ${bible.openingRitual}`,
    `vibe: ${bible.vibe}`,
    `runningMotifs: ${bible.runningMotifs.join("; ") || "(none)"}`,
    "Honour openingRitual on turn 1 so this sounds like the same programme.",
  ].join("\n");
}

function jsonSurface(turnLimit: number): string {
  return [
    "Do not use the open web. Do not invent sources.",
    "Return only JSON. JSON-only. Do not wrap the response in markdown.",
    "Each turn must include: id, speaker (clementine | ann), kind (content | banter | quiz-prompt | model-answer | interrupt | cue | empty), text, citations (array of { pageId, title, sourceUrl? }).",
    `Write at most ${turnLimit} turns. Turns past that are discarded.`,
  ].join(" ");
}

export function buildPodcastPrompt(input: PodcastWriterPromptInput): string {
  const memories = input.memories.length
    ? `Previous shows (not citable):\n${input.memories.map(memory => `- ${memory}`).join("\n")}`
    : "Previous shows: none.";

  return assembleClementinePrompt({
    voice: PODCAST_VOICE,
    job: clementinePodcast,
    surface: [annPodcast, jsonSurface(turnCap(input.dials.length))].join("\n\n"),
    payload: [
      `Mode: ${input.mode}`,
      `Mode dials: ${JSON.stringify(input.modeDial)}`,
      `Dials: ${JSON.stringify(input.dials)}`,
      `Notes:\n${noteLines(input.notes) || "(none)"}`,
      memories,
      bibleLines(input.bible),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}

export function buildPodcastEditorPrompt(input: PodcastPromptInput & { draft: PodcastTurn[] }): string {
  return assembleClementinePrompt({
    voice: PODCAST_VOICE,
    job: podcastEditor,
    surface: [
      annPodcast,
      EDITOR_SURFACE,
      jsonSurface(turnCap(input.dials.length)),
    ].join("\n\n"),
    payload: [
      `Mode: ${input.mode}`,
      `Mode dials: ${JSON.stringify(input.modeDial)}`,
      `Dials: ${JSON.stringify(input.dials)}`,
      `Notes:\n${noteLines(input.notes) || "(none)"}`,
      bibleLines(input.bible),
      `Draft turns:\n${JSON.stringify({ turns: input.draft })}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}

const ScriptSchema = z.object({
  turns: z.array(PodcastTurnSchema),
});

function preview(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}…`;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const objectStart = candidate.indexOf("{");
  const arrayStart = candidate.indexOf("[");
  if (objectStart < 0 && arrayStart < 0) return candidate;
  if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
    const end = candidate.lastIndexOf("]");
    return end > arrayStart ? candidate.slice(arrayStart, end + 1) : candidate.slice(arrayStart);
  }
  const end = candidate.lastIndexOf("}");
  return end > objectStart ? candidate.slice(objectStart, end + 1) : candidate.slice(objectStart);
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Recover complete turn objects from a truncated `{"turns":[...` or `[...` payload. */
function recoverTurnObjects(raw: string): unknown[] {
  const turnsKey = raw.indexOf('"turns"');
  const arrayStart =
    turnsKey >= 0
      ? raw.indexOf("[", turnsKey)
      : raw.trimStart().startsWith("[")
        ? raw.indexOf("[")
        : -1;
  if (arrayStart < 0) return [];

  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let index = arrayStart + 1; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const parsed = tryParse(raw.slice(start, index + 1));
        if (parsed && typeof parsed === "object") objects.push(parsed);
        start = -1;
      }
    }
  }
  return objects;
}

function asTurnList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { turns?: unknown }).turns)) {
    return (parsed as { turns: unknown[] }).turns;
  }
  return null;
}

function normalizeTurns(rawTurns: unknown[]): PodcastTurn[] {
  const turns: PodcastTurn[] = [];
  for (const turn of rawTurns) {
    if (!turn || typeof turn !== "object") continue;
    const value = turn as Record<string, unknown>;
    const parsed = PodcastTurnSchema.safeParse({
      ...value,
      id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
      citations: Array.isArray(value.citations) ? value.citations : [],
    });
    if (parsed.success) turns.push(parsed.data);
  }
  return turns;
}

export function parsePodcastScript(raw: string): PodcastTurn[] {
  const extracted = extractJson(raw);
  const parsed = tryParse(extracted);
  const list = asTurnList(parsed);

  if (list) {
    return ScriptSchema.parse({ turns: normalizeTurns(list) }).turns;
  }

  const recovered = normalizeTurns(recoverTurnObjects(extracted));
  if (recovered.length) return ScriptSchema.parse({ turns: recovered }).turns;

  throw new Error(`Podcast script JSON is invalid (preview: ${preview(raw)})`);
}
