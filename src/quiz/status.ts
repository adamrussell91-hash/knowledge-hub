import type { FsrsCard, QuizItemStatus, QuizRating } from "./schema";

export function deriveStatus(card: FsrsCard, lastRating?: QuizRating, now: Date = new Date()): QuizItemStatus {
  if (card.reps === 0) return "untested";
  if (lastRating === 1 || card.state === 3) return "failed";
  if (Date.parse(card.due) < now.getTime()) return "decaying";
  if (card.reps >= 2 && card.scheduled_days >= 21) return "verified";
  if (card.scheduled_days >= 7) return "verified";
  return "untested";
}
