import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { getContent, GitHubWriteError } from "./_lib/githubWrite";
import { requireSession } from "./_lib/requireSession";
import { parseQuizStore } from "./_lib/saveQuizRecord";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const denied = requireSession(event);
  if (denied) return denied;
  const repo = process.env.GITHUB_DATA_REPO;
  const token = process.env.GITHUB_DATA_REPO_TOKEN;
  if (!repo || !token) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Data repo is not configured" }) };
  }
  try {
    const file = await getContent(repo, token, "quiz/schedule.json");
    const store = file ? parseQuizStore(file.text) : { schema_version: 1, schedule: [], edges: [], dumps: [] };
    return { statusCode: 200, headers: cors(), body: JSON.stringify(store) };
  } catch (error) {
    const status = error instanceof GitHubWriteError ? 502 : 502;
    const message = error instanceof Error ? error.message : "Quiz load failed";
    return { statusCode: status, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
