import type { HandlerEvent, HandlerResponse } from "@netlify/functions";
import { headerValue, jsonHeaders, requestOrigin } from "./cors";
import { verifySession } from "./session";

export function cookieHeader(event: HandlerEvent): string {
  const multi = event.multiValueHeaders?.cookie ?? event.multiValueHeaders?.Cookie;
  if (Array.isArray(multi) && multi.length) return multi.filter(Boolean).join("; ");
  return headerValue(event.headers, "cookie");
}

export function sessionTokens(cookie: string): string[] {
  const tokens: string[] = [];
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== "kh_session") continue;
    const raw = trimmed.slice(eq + 1).trim();
    if (!raw) continue;
    try {
      tokens.push(decodeURIComponent(raw));
    } catch {
      tokens.push(raw);
    }
  }
  return tokens;
}

export function requireSession(event: HandlerEvent): HandlerResponse | null {
  const origin = requestOrigin(event.headers);
  const tokens = sessionTokens(cookieHeader(event));
  if (!tokens.length || !process.env.SESSION_SECRET) {
    return { statusCode: 401, headers: jsonHeaders(origin), body: JSON.stringify({ error: "Unauthenticated" }) };
  }
  for (const value of tokens) {
    try {
      verifySession(value, process.env.SESSION_SECRET);
      return null;
    } catch {
      /* A stale Domain= leftover can arrive first. Try the rest. */
    }
  }
  return { statusCode: 401, headers: jsonHeaders(origin), body: JSON.stringify({ error: "Unauthenticated" }) };
}
