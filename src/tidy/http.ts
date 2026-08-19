import { verifySession } from "../../netlify/functions/_lib/session";
import type { Page } from "../domain/page";

export const KNOWLEDGE_HUB_ORIGIN = "https://knowledge-hub.adam-russell.com";

export type TidyHttpBindings = {
  sessionSecret: string;
  allowedOrigin: string;
  tidyPage: (id: string) => Promise<Page>;
};

function corsHeaders(allowedOrigin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function cookieValue(header: string | null, name: string) {
  if (!header) return "";
  const match = header.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function readId(request: Request) {
  try {
    const payload = (await request.json()) as { id?: unknown };
    return typeof payload.id === "string" ? payload.id.trim() : "";
  } catch {
    return "";
  }
}

export async function handleTidyRequest(request: Request, bindings: TidyHttpBindings): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(bindings.allowedOrigin);
  if (origin && origin !== bindings.allowedOrigin) {
    return json(403, { error: "Origin not allowed" }, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" }, headers);
  }
  const token = cookieValue(request.headers.get("Cookie"), "kh_session");
  if (!bindings.sessionSecret || !token) {
    return json(401, { error: "Unauthenticated" }, headers);
  }
  try {
    verifySession(token, bindings.sessionSecret);
  } catch {
    return json(401, { error: "Unauthenticated" }, headers);
  }
  const id = await readId(request);
  if (!id) return json(400, { error: "id is required" }, headers);
  try {
    return json(200, await bindings.tidyPage(id), headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tidy failed";
    return json(502, { error: message }, headers);
  }
}
