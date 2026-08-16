import type { QuizItemKind, QuizScheduleEntry } from "./schema";

export type SprintOptions = {
  durationMinutes: 5 | 15 | 30;
  area?: "university" | "notes";
  tags?: string[];
  kinds?: QuizItemKind[];
  cram?: boolean;
  whyHow?: boolean;
  interleave?: boolean;
  now?: Date;
  random?: () => number;
};

export function cardCapForDuration(minutes: 5 | 15 | 30) {
  if (minutes === 5) return 8;
  if (minutes === 15) return 20;
  return 36;
}

export function buildSprintQueue(schedule: QuizScheduleEntry[], options: SprintOptions) {
  const now = options.now ?? new Date();
  const cap = cardCapForDuration(options.durationMinutes);
  const scoped = schedule.filter(entry => {
    if (options.area && entry.area !== options.area) return false;
    if (options.tags?.length && !options.tags.every(tag => entry.tags.includes(tag))) return false;
    if (options.kinds?.length && !options.kinds.includes(entry.kind)) return false;
    if (options.whyHow && !/\b(why|how)\b/i.test(entry.cue_preview)) return false;
    return true;
  });
  if (options.interleave) {
    return interleaveByKind(scoped, options.random ?? Math.random).slice(0, cap);
  }
  if (options.cram) {
    return shuffle(scoped, options.random ?? Math.random).slice(0, cap);
  }
  const due = scoped
    .filter(entry => Date.parse(entry.due) <= now.getTime())
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  const dueIds = new Set(due.map(entry => entry.id));
  const untested = scoped.filter(entry => !dueIds.has(entry.id) && entry.status === "untested" && entry.reps === 0);
  return [...due, ...untested].slice(0, cap);
}

function interleaveByKind(items: QuizScheduleEntry[], random: () => number) {
  const buckets = new Map<QuizItemKind, QuizScheduleEntry[]>();
  for (const item of items) {
    const list = buckets.get(item.kind) ?? [];
    list.push(item);
    buckets.set(item.kind, list);
  }
  for (const list of buckets.values()) shuffle(list, random);
  const kinds = shuffle([...buckets.keys()], random);
  const mixed: QuizScheduleEntry[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const kind of kinds) {
      const next = buckets.get(kind)?.shift();
      if (next) {
        mixed.push(next);
        added = true;
      }
    }
  }
  return mixed;
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
