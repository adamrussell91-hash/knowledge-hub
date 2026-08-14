import type { HandlerEvent, HandlerResponse } from "@netlify/functions";

export function cors(origin = process.env.SITE_ORIGIN): Record<string, string> {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, x-alchemist-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function preflight(event: Pick<HandlerEvent, "httpMethod">): HandlerResponse | null {
  if (event.httpMethod !== "OPTIONS") return null;
  return { statusCode: 204, headers: cors(), body: "" };
}
