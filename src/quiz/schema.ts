export type QuizItemKind = "qa" | "definition" | "heading" | "gap" | "known" | "cloze";
export type QuizItemStatus = "untested" | "verified" | "decaying" | "failed";
export type QuizRating = 1 | 2 | 3 | 4;

export type FsrsCard = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  learning_steps: number;
  last_review?: string;
};

export type QuizItem = {
  id: string;
  page_id: string;
  area: "university" | "notes";
  tags: string[];
  kind: QuizItemKind;
  cue: string;
  answer: string;
  harvested_at: string;
  source_updated_at: string;
  fsrs: FsrsCard;
  status: QuizItemStatus;
  last_rating?: QuizRating;
  x?: number;
  y?: number;
};

export type QuizScheduleEntry = {
  id: string;
  page_id: string;
  area: "university" | "notes";
  tags: string[];
  kind: QuizItemKind;
  cue_preview: string;
  due: string;
  status: QuizItemStatus;
  reps: number;
  lapses: number;
  x?: number;
  y?: number;
};

export type QuizEdge = {
  from: string;
  to: string;
  page_id: string;
};

export type DumpSnapshot = {
  topic: string;
  page_id: string;
  nodes: { id: string; x: number; y: number; text: string; type: "black" | "blue" | "center" }[];
  edges: { from: string; to: string }[];
  saved_at: string;
};

export type QuizStore = {
  schema_version: 1;
  schedule: QuizScheduleEntry[];
  edges: QuizEdge[];
  dumps: DumpSnapshot[];
};

export function newFsrsCard(now: Date = new Date()): FsrsCard {
  return {
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    learning_steps: 0,
  };
}

export function toScheduleEntry(item: QuizItem): QuizScheduleEntry {
  return {
    id: item.id,
    page_id: item.page_id,
    area: item.area,
    tags: item.tags,
    kind: item.kind,
    cue_preview: item.cue.slice(0, 80),
    due: item.fsrs.due,
    status: item.status,
    reps: item.fsrs.reps,
    lapses: item.fsrs.lapses,
    ...(item.x !== undefined ? { x: item.x } : {}),
    ...(item.y !== undefined ? { y: item.y } : {}),
  };
}

export function emptyQuizStore(): QuizStore {
  return { schema_version: 1, schedule: [], edges: [], dumps: [] };
}
