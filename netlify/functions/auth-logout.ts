import type { Handler } from "@netlify/functions";
import { expiredSessionCookie } from "./_lib/authLogin";
import { cors, preflight } from "./_lib/cors";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  return {
    statusCode: 200,
    headers: {
      ...cors(event.headers.origin),
      "Set-Cookie": expiredSessionCookie(),
    },
    body: JSON.stringify({ ok: true }),
  };
};
