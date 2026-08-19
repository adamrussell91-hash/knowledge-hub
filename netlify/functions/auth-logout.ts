import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  return {
    statusCode: 200,
    headers: {
      ...cors(event.headers.origin),
      "Set-Cookie": "kh_session=; Domain=.adam-russell.com; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0",
    },
    body: JSON.stringify({ ok: true }),
  };
};
