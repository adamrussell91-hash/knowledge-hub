import type { Handler } from "@netlify/functions";
import { PageSchema } from "../../src/domain/page";
import { cors, preflight } from "./_lib/cors";
import { getContent, putContent, GitHubWriteError } from "./_lib/githubWrite";
import { requireSession } from "./_lib/requireSession";
import { savePageRecord } from "./_lib/savePageRecord";

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
  let raw: unknown;
  try {
    raw = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }
  const title = typeof (raw as { title?: string }).title === "string" ? (raw as { title: string }).title.trim() : "";
  if (!title) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Title is required" }) };
  }
  const parsed = PageSchema.safeParse({ ...(raw as object), title });
  if (!parsed.success) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid page" }) };
  }
  try {
    const saved = await savePageRecord(parsed.data, {
      getContent: file => getContent(repo, token, file),
      putContent: (file, text, sha, message) => putContent(repo, token, file, text, sha, message),
    });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(saved) };
  } catch (error) {
    const status = error instanceof GitHubWriteError ? (error.status === 409 ? 409 : 502) : 502;
    const message = error instanceof Error ? error.message : "Save failed";
    return { statusCode: status, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
