import { GitHubWriteError } from "./githubWrite";
import { mergeItemFile } from "../../../src/quiz/store";
import {
  emptyQuizStore,
  toScheduleEntry,
  type DumpSnapshot,
  type QuizEdge,
  type QuizItem,
  type QuizScheduleEntry,
  type QuizStore,
} from "../../../src/quiz/schema";

export type ContentFns = {
  getContent: (file: string) => Promise<{ sha: string; text: string } | null>;
  putContent: (file: string, text: string, sha?: string, message?: string) => Promise<void>;
};

const PAGE_ID = /^page_[a-z0-9_]+$/i;

export async function saveQuizRecord(
  input: { schedule: QuizScheduleEntry[]; items: QuizItem[]; edges?: QuizEdge[]; dumps?: DumpSnapshot[] },
  fns: ContentFns,
): Promise<QuizStore> {
  const current = await fns.getContent("quiz/schedule.json");
  const previous = current ? parseQuizStore(current.text) : emptyQuizStore();
  const store: QuizStore = {
    schema_version: 1,
    schedule: input.schedule,
    edges: input.edges ?? previous.edges,
    dumps: input.dumps ?? previous.dumps,
  };
  await putWithRetry("quiz/schedule.json", JSON.stringify(store), fns, "Save quiz schedule", current?.sha);
  const byPage = new Map<string, QuizItem[]>();
  for (const item of input.items) {
    if (!PAGE_ID.test(item.page_id)) continue;
    const list = byPage.get(item.page_id) ?? [];
    list.push(item);
    byPage.set(item.page_id, list);
  }
  for (const [pageId, incoming] of byPage) {
    const path = `quiz/items/${pageId}.json`;
    const existingFile = await fns.getContent(path);
    const existing = existingFile ? parseItems(existingFile.text) : [];
    const merged = mergeItemFile(existing, incoming);
    await putWithRetry(path, JSON.stringify({ items: merged }), fns, `Save quiz items ${pageId}`, existingFile?.sha);
  }
  return store;
}

export function parseQuizStore(text: string): QuizStore {
  const raw = JSON.parse(text) as Partial<QuizStore>;
  return {
    schema_version: 1,
    schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    dumps: Array.isArray(raw.dumps) ? raw.dumps : [],
  };
}

export function parseSchedule(text: string): QuizScheduleEntry[] {
  return parseQuizStore(text).schedule;
}

export function parseItems(text: string): QuizItem[] {
  const raw = JSON.parse(text) as { items?: QuizItem[] } | QuizItem[];
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw.items) ? raw.items : [];
}

export function scheduleFromItems(items: QuizItem[]): QuizScheduleEntry[] {
  return items.map(toScheduleEntry);
}

async function putWithRetry(file: string, text: string, fns: ContentFns, message: string, knownSha?: string) {
  const current = knownSha !== undefined ? { sha: knownSha } : await fns.getContent(file);
  try {
    await fns.putContent(file, text, current?.sha, message);
  } catch (error) {
    if (!(error instanceof GitHubWriteError) || error.status !== 409) throw error;
    const again = await fns.getContent(file);
    try {
      await fns.putContent(file, text, again?.sha, message);
    } catch (retry) {
      if (retry instanceof GitHubWriteError && retry.status === 409) {
        throw new GitHubWriteError("save collided, try again", 409);
      }
      throw retry;
    }
  }
}
