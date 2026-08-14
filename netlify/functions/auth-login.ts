import type { Handler } from "@netlify/functions";
import { createHash } from "node:crypto";
import { cors, preflight } from "./_lib/cors";
import { signSession } from "./_lib/session";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const passphrase = JSON.parse(event.body ?? "{}").passphrase;
  const valid =
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH &&
    createHash("sha256")
      .update(passphrase ?? "")
      .digest("hex") === process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH;
  if (!valid || !process.env.SESSION_SECRET) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Invalid passphrase" }) };
  }
  const token = signSession({ sub: "single-user" }, process.env.SESSION_SECRET);
  return {
    statusCode: 200,
    headers: {
      ...cors(),
      "Set-Cookie": `kh_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000`,
    },
    body: JSON.stringify({ ok: true }),
  };
};
