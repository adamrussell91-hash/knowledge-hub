import type { Handler } from "@netlify/functions";
import { expiredSessionCookies } from "./_lib/authLogin";
import { jsonHeaders, preflight, requestOrigin } from "./_lib/cors";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  return {
    statusCode: 200,
    headers: jsonHeaders(requestOrigin(event.headers)),
    multiValueHeaders: { "Set-Cookie": expiredSessionCookies() },
    body: JSON.stringify({ ok: true }),
  };
};
