import type { Handler } from "@netlify/functions";
import { jsonHeaders, preflight, requestOrigin } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const headers = jsonHeaders(requestOrigin(event.headers));
  const denied = requireSession(event);
  if (denied) return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false }) };
  return { statusCode: 200, headers, body: JSON.stringify({ authenticated: true }) };
};
