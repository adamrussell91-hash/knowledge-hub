import { z } from "zod";

export const PodcastModeSchema = z.enum(["recap", "connector", "quiz", "debate"]);
export type PodcastMode = z.infer<typeof PodcastModeSchema>;

export const PodcastDialsSchema = z.object({
  length: z.enum(["short", "standard", "deep"]).default("standard"),
  complexity: z.enum(["plain", "academic"]).default("academic"),
  citationDensity: z.enum(["light", "normal", "heavy"]).default("normal"),
  formality: z.enum(["dry-academic", "staffroom", "mates"]).default("staffroom"),
  banter: z.enum(["low", "medium", "high"]).default("medium"),
  disagreement: z.enum(["mild", "medium", "sharp"]).default("medium"),
  chicken: z.number().int().min(0).max(3).default(1),
  pacing: z.enum(["linger", "even", "race"]).default("even"),
  interruption: z.enum(["finish-thought", "immediate"]).default("finish-thought"),
});
export type PodcastDials = z.infer<typeof PodcastDialsSchema>;

export const PodcastSpeakerSchema = z.enum(["clementine", "ann"]);
export const PodcastTurnKindSchema = z.enum([
  "content",
  "banter",
  "quiz-prompt",
  "model-answer",
  "interrupt",
  "cue",
  "empty",
]);

export const PodcastCitationSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  sourceUrl: z.string().optional(),
});

export const PodcastTurnSchema = z.object({
  id: z.string(),
  speaker: PodcastSpeakerSchema.optional(),
  kind: PodcastTurnKindSchema,
  text: z.string(),
  citations: z.array(PodcastCitationSchema).default([]),
  audioKey: z.string().optional(),
});
export type PodcastTurn = z.infer<typeof PodcastTurnSchema>;

export const PodcastEpisodeSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  status: z.enum(["running", "ready", "error", "cancelled"]),
  mode: PodcastModeSchema,
  scope: z
    .object({
      area: z.enum(["university", "notes"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  modeDial: z.record(z.string()).default({}),
  dials: PodcastDialsSchema.default({}),
  sourcePageIds: z.array(z.string()),
  turns: z.array(PodcastTurnSchema),
  memory: z.string().default(""),
  seriesId: z.string().optional(),
  episodeIndex: z.number().int().positive().optional(),
  showTitle: z.string().optional(),
  error: z.string().optional(),
  progress_at: z.string().optional(),
});
export type PodcastEpisode = z.infer<typeof PodcastEpisodeSchema>;

export const SeriesSlotSchema = z.object({
  index: z.number().int().positive(),
  title: z.string(),
  throughLine: z.string(),
  mode: PodcastModeSchema,
  sourcePageIds: z.array(z.string()),
  episodeId: z.string().optional(),
});
export type SeriesSlot = z.infer<typeof SeriesSlotSchema>;

export const PodcastSeriesSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  topic: z.string().min(1),
  scope: z
    .object({
      area: z.enum(["university", "notes"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  cadence: z.enum(["weekly", "monthly", "half-yearly", "yearly"]),
  dials: PodcastDialsSchema.default({}),
  showTitle: z.string().min(1),
  openingRitual: z.string().min(1),
  vibe: z.string().min(1),
  runningMotifs: z.array(z.string()).default([]),
  slots: z.array(SeriesSlotSchema).min(3).max(12),
});
export type PodcastSeries = z.infer<typeof PodcastSeriesSchema>;

export const noteCap = (length: PodcastDials["length"], pacing: PodcastDials["pacing"]) => {
  const base = { short: 12, standard: 24, deep: 40 }[length];
  if (pacing === "linger") return Math.max(6, Math.floor(base * 0.6));
  if (pacing === "race") return base;
  return base;
};

export const turnCap = (length: PodcastDials["length"]) =>
  ({ short: 24, standard: 48, deep: 90 }[length]);
