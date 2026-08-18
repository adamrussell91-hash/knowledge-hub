import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { GitHubWriteError } from "./_lib/githubWrite";
import { requireSession } from "./_lib/requireSession";
import { executeCuratorRunFromEnv } from "./curatorRun";

function header(event: { headers?: Record<string, string | undefined> }, name: string) {
  const headers = event.headers ?? {};
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const scheduled = header(event, "x-nf-event") === "schedule";
  const authorized = scheduled || header(event, "x-curator-run") === process.env.SESSION_SECRET;
  if (!authorized) {
    const denied = requireSession(event);
    if (denied) return denied;
  }
  try {
    const result = await executeCuratorRunFromEnv(process.env);
    return { statusCode: 200, headers: cors(), body: JSON.stringify(result) };
  } catch (error) {
    const status = error instanceof GitHubWriteError ? (error.status === 409 ? 409 : 502) : 502;
    const message = error instanceof Error ? error.message : "Curator failed";
    return { statusCode: status, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
