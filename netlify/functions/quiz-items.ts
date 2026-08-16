import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { getContent, GitHubWriteError } from "./_lib/githubWrite";
import { requireSession } from "./_lib/requireSession";
import { parseItems } from "./_lib/saveQuizRecord";

const PAGE_ID = /^page_[a-z0-9_]+$/i;

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const denied = requireSession(event);
  if (denied) return denied;
  const pageId = event.path.split("/").pop() ?? "";
  if (!PAGE_ID.test(pageId)) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid page id" }) };
  }
  const repo = process.env.GITHUB_DATA_REPO;
  const token = process.env.GITHUB_DATA_REPO_TOKEN;
  if (!repo || !token) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Data repo is not configured" }) };
  }
  try {
    const file = await getContent(repo, token, `quiz/items/${pageId}.json`);
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ items: file ? parseItems(file.text) : [] }) };
  } catch (error) {
    const message = error instanceof GitHubWriteError ? error.message : "Quiz load failed";
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
