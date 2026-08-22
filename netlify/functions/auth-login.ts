import type { Handler } from "@netlify/functions";
import { createHash } from "node:crypto";
import { loginCookies } from "./_lib/authLogin";
import { jsonHeaders, preflight, requestOrigin } from "./_lib/cors";
import { signSession } from "./_lib/session";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const origin = requestOrigin(event.headers);
  const passphrase = JSON.parse(event.body ?? "{}").passphrase;
  const valid =
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH &&
    createHash("sha256")
      .update(passphrase ?? "")
      .digest("hex") === process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH;
  if (!valid || !process.env.SESSION_SECRET) {
    return { statusCode: 401, headers: jsonHeaders(origin), body: JSON.stringify({ error: "Invalid passphrase" }) };
  }
  const token = signSession({ sub: "single-user" }, process.env.SESSION_SECRET);
  return {
    statusCode: 200,
    headers: jsonHeaders(origin),
    multiValueHeaders: { "Set-Cookie": loginCookies(token) },
    body: JSON.stringify({ ok: true }),
  };
};
