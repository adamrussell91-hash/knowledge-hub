import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";

const DEFAULT_KERNEL_URL = "https://knowledge-hub-research.adamrussell91.workers.dev";

function kernelBase() {
  return (process.env.RESEARCH_KERNEL_URL || DEFAULT_KERNEL_URL).replace(/\/+$/, "");
}

async function kernelFetch(path: string, init: RequestInit) {
  const secret = process.env.RESEARCH_KERNEL_SHARED_SECRET;
  if (!secret) return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Capture is unavailable" }) };
  const response = await fetch(`${kernelBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-research-kernel-secret": secret,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    statusCode: response.status || (response.ok ? 200 : 502),
    headers: cors(),
    body: text,
  };
}

function parseBody(raw: string | null) {
  try {
    const parsed = JSON.parse(raw ?? "{}") as { r2_key?: unknown };
    const r2_key = typeof parsed.r2_key === "string" ? parsed.r2_key.trim() : "";
    if (!r2_key) return null;
    return { r2_key };
  } catch {
    return null;
  }
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  if (event.httpMethod !== "POST") {
    return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: "Not found" }) };
  }
  const body = parseBody(event.body);
  if (!body) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "r2_key is required" }) };
  return kernelFetch("/capture", { method: "POST", body: JSON.stringify(body) });
};
