import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";

const DEFAULT_KERNEL_URL = "https://knowledge-hub-research.adamrussell91.workers.dev";

function kernelBase() {
  return (process.env.RESEARCH_KERNEL_URL || DEFAULT_KERNEL_URL).replace(/\/+$/, "");
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const secret = process.env.RESEARCH_KERNEL_SHARED_SECRET;
  if (!secret) {
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
  const response = await fetch(`${kernelBase()}/tidy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-research-kernel-secret": secret,
    },
    body: JSON.stringify({ id }),
  });
  const text = await response.text();
  return {
    statusCode: response.status || (response.ok ? 200 : 502),
    headers: cors(),
    body: text,
  };
};
