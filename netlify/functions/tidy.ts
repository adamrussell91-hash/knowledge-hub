import type { Handler } from "@netlify/functions";
import { loadPromptFile } from "../../src/clementine/loadFromDisk";
import { tidyPageDirect } from "../../src/tidy/githubIo";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const repo = process.env.GITHUB_DATA_REPO;
  const token = process.env.GITHUB_DATA_REPO_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!repo || !token) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Data repo is not configured for writes" }) };
  }
  if (!apiKey) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Tidy is unavailable" }) };
  }
  let id = "";
  try {
    const payload = JSON.parse(event.body ?? "{}") as { id?: unknown };
    id = typeof payload.id === "string" ? payload.id.trim() : "";
  } catch {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }
  if (!id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "id is required" }) };
  try {
    const page = await tidyPageDirect({
      id,
      repo,
      token,
      apiKey,
      prompt: loadPromptFile("tidy.md"),
    });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(page) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tidy failed";
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
