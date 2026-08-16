import type { Handler } from "@netlify/functions";
import type { DumpSnapshot, QuizEdge, QuizItem, QuizScheduleEntry } from "../../src/quiz/schema";
import { cors, preflight } from "./_lib/cors";
import { getContent, GitHubWriteError, putContent } from "./_lib/githubWrite";
import { requireSession } from "./_lib/requireSession";
import { saveQuizRecord } from "./_lib/saveQuizRecord";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const denied = requireSession(event);
  if (denied) return denied;
  const repo = process.env.GITHUB_DATA_REPO;
  const token = process.env.GITHUB_DATA_REPO_TOKEN;
  if (!repo || !token) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Data repo is not configured for writes" }) };
  }
  if ((event.body?.length ?? 0) > 1_500_000) {
    return { statusCode: 413, headers: cors(), body: JSON.stringify({ error: "Quiz save too large" }) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }
  const schedule = (raw as { schedule?: QuizScheduleEntry[] }).schedule;
  const items = (raw as { items?: QuizItem[] }).items;
  const edges = (raw as { edges?: QuizEdge[] }).edges;
  const dumps = (raw as { dumps?: DumpSnapshot[] }).dumps;
  if (!Array.isArray(schedule) || !Array.isArray(items)) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid quiz payload" }) };
  }
  try {
    const saved = await saveQuizRecord(
      { schedule, items, edges: Array.isArray(edges) ? edges : undefined, dumps: Array.isArray(dumps) ? dumps : undefined },
      {
        getContent: file => getContent(repo, token, file),
        putContent: (file, text, sha, message) => putContent(repo, token, file, text, sha, message),
      },
    );
    return { statusCode: 200, headers: cors(), body: JSON.stringify(saved) };
  } catch (error) {
    const status = error instanceof GitHubWriteError ? (error.status === 409 ? 409 : 502) : 502;
    const message = error instanceof Error ? error.message : "Save failed";
    return { statusCode: status, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
