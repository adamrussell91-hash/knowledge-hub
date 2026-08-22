import type { Handler } from "@netlify/functions";
import { createHash } from "node:crypto";
import {
  DEFAULT_HUB,
  cleanReturnTo,
  headerValue,
  loginPageFailurePath,
  parseLoginBody,
  readBody,
  safeReturnTo,
  sessionCookie,
} from "./_lib/authLogin";
import { cors, preflight } from "./_lib/cors";
import { signSession } from "./_lib/session";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const { passphrase, returnTo, viaForm } = parseLoginBody(
    readBody(event.body, event.isBase64Encoded),
    headerValue(event.headers, "content-type"),
  );
  const redirectTo = viaForm ? cleanReturnTo(safeReturnTo(returnTo) ?? DEFAULT_HUB) : null;
  const valid =
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH &&
    createHash("sha256")
      .update(passphrase ?? "")
      .digest("hex") === process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH;
  if (!valid || !process.env.SESSION_SECRET) {
    if (redirectTo) {
      return {
        statusCode: 303,
        headers: { ...cors(event.headers.origin), Location: loginPageFailurePath(redirectTo) },
        body: "",
      };
    }
    return { statusCode: 401, headers: cors(event.headers.origin), body: JSON.stringify({ error: "Invalid passphrase" }) };
  }
  const token = signSession({ sub: "single-user" }, process.env.SESSION_SECRET);
  if (redirectTo) {
    return {
      statusCode: 303,
      headers: {
        ...cors(event.headers.origin),
        "Set-Cookie": sessionCookie(token),
        Location: redirectTo,
      },
      body: "",
    };
  }
  return {
    statusCode: 200,
    headers: {
      ...cors(event.headers.origin),
      "Set-Cookie": sessionCookie(token),
    },
    body: JSON.stringify({ ok: true }),
  };
};
