import type { QuizEdge, QuizItemStatus, QuizScheduleEntry } from "./schema";

export type StatusTone = "black" | "blue" | "orange";

export function statusTone(status: QuizItemStatus): StatusTone {
  if (status === "verified") return "black";
  if (status === "untested") return "blue";
  return "orange";
}

export function filterSchedule(
  schedule: QuizScheduleEntry[],
  options: { area?: "university" | "notes"; tags?: string[] },
) {
  return schedule.filter(entry => {
    if (options.area && entry.area !== options.area) return false;
    if (options.tags?.length && !options.tags.every(tag => entry.tags.includes(tag))) return false;
    return true;
  });
}

export function groupByStatus(schedule: QuizScheduleEntry[]) {
  const grouped: Record<QuizItemStatus, QuizScheduleEntry[]> = {
    untested: [],
    decaying: [],
    failed: [],
    verified: [],
  };
  for (const entry of schedule) grouped[entry.status].push(entry);
  return grouped;
}

const COLUMN_X: Record<QuizItemStatus, number> = {
  untested: 12,
  decaying: 37,
  failed: 62,
  verified: 87,
};

export function connectionBoard(schedule: QuizScheduleEntry[], edges: QuizEdge[]) {
  const counts: Record<QuizItemStatus, number> = { untested: 0, decaying: 0, failed: 0, verified: 0 };
  const nodes = schedule.map(entry => {
    const index = counts[entry.status]++;
    return {
      ...entry,
      x: entry.x ?? COLUMN_X[entry.status],
      y: entry.y ?? Math.min(88, 14 + index * 12),
      tone: statusTone(entry.status),
    };
  });
  const ids = new Set(schedule.map(entry => entry.id));
  return {
    nodes,
    edges: edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)),
  };
}
