import type { HandlerEvent, HandlerResponse } from "@netlify/functions";

const KNOWN_ORIGINS = new Set([
  "https://knowledge-hub.adam-russell.com",
  "https://adamrussell91-hash.github.io",
]);

export function cors(requestOrigin?: string): Record<string, string> {
  const allowedOrigin = requestOrigin && KNOWN_ORIGINS.has(requestOrigin) ? requestOrigin : process.env.SITE_ORIGIN;
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, x-alchemist-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function preflight(event: Pick<HandlerEvent, "httpMethod" | "headers">): HandlerResponse | null {
  if (event.httpMethod !== "OPTIONS") return null;
  return { statusCode: 204, headers: cors(event.headers?.origin), body: "" };
}
