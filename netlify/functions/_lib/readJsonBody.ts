import type { HandlerEvent } from "@netlify/functions";

/** Netlify sometimes base64-encodes POST bodies. Decode before JSON.parse. */
export function readRawBody(event: Pick<HandlerEvent, "body" | "isBase64Encoded">): string {
  const raw = event.body ?? "";
  if (!raw) return "";
  if (event.isBase64Encoded) {
    try {
      return Buffer.from(raw, "base64").toString("utf8");
    } catch {
      return raw;
    }
  }
  return raw;
}
