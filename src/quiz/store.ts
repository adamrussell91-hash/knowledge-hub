import type { DumpSnapshot, QuizEdge, QuizItem, QuizScheduleEntry } from "./schema";

export function mergeItemFile(existing: QuizItem[], incoming: QuizItem[]) {
  const byId = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export function mergeSchedule(existing: QuizScheduleEntry[], incoming: QuizScheduleEntry[]) {
  const byId = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export function replaceTopicEdges(existing: QuizEdge[], pageId: string, incoming: QuizEdge[]) {
  return [...existing.filter(edge => edge.page_id !== pageId), ...incoming];
}

export function upsertDump(existing: DumpSnapshot[], snapshot: DumpSnapshot) {
  return [...existing.filter(dump => dump.page_id !== snapshot.page_id), snapshot];
}
