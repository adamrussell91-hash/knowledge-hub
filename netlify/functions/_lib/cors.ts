import type { HandlerEvent, HandlerResponse } from "@netlify/functions";

export const KNOWN_ORIGINS = new Set([
  "https://knowledge-hub.adam-russell.com",
  "https://adamrussell91-hash.github.io",
]);

export function headerValue(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value ?? "";
  }
  return "";
}

export function requestOrigin(
  headers?: Record<string, string | undefined>,
): string | undefined {
  return headerValue(headers, "origin") || undefined;
}

export function cors(requestOriginValue?: string): Record<string, string> {
  const allowedOrigin =
    requestOriginValue && KNOWN_ORIGINS.has(requestOriginValue)
      ? requestOriginValue
      : process.env.SITE_ORIGIN;
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, x-alchemist-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function jsonHeaders(requestOriginValue?: string): Record<string, string> {
  return {
    ...cors(requestOriginValue),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

export function preflight(event: Pick<HandlerEvent, "httpMethod" | "headers">): HandlerResponse | null {
  if (event.httpMethod !== "OPTIONS") return null;
  return { statusCode: 204, headers: cors(requestOrigin(event.headers)), body: "" };
}
