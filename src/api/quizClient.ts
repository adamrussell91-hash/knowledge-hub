import { USE_LOCAL_DATA } from "./client";
import { API_BASE } from "./config";
import { loadLocalQuiz, persistLocalQuiz } from "../quiz/localStore";
import type { DumpSnapshot, QuizEdge, QuizItem, QuizScheduleEntry, QuizStore } from "../quiz/schema";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) throw new Error(`API error ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export async function getQuizSchedule(): Promise<QuizStore> {
  if (USE_LOCAL_DATA) {
    const local = loadLocalQuiz();
    return { schema_version: 1, schedule: local.schedule, edges: local.edges, dumps: local.dumps };
  }
  return apiFetch<QuizStore>("/quiz");
}

export async function getQuizItems(pageId: string): Promise<QuizItem[]> {
  if (USE_LOCAL_DATA) {
    return loadLocalQuiz().itemsByPage[pageId] ?? [];
  }
  const payload = await apiFetch<{ items: QuizItem[] }>(`/quiz/items/${encodeURIComponent(pageId)}`);
  return payload.items;
}

export async function saveQuiz(input: {
  schedule: QuizScheduleEntry[];
  items: QuizItem[];
  edges?: QuizEdge[];
  dumps?: DumpSnapshot[];
}): Promise<QuizStore> {
  if (USE_LOCAL_DATA) {
    persistLocalQuiz(input.schedule, input.items, { edges: input.edges, dumps: input.dumps });
    return {
      schema_version: 1,
      schedule: input.schedule,
      edges: input.edges ?? loadLocalQuiz().edges,
      dumps: input.dumps ?? loadLocalQuiz().dumps,
    };
  }
  return apiFetch<QuizStore>("/quiz-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
