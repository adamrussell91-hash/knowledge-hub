import type { ResearchResult } from "./schema";

export type DeepStartResponse = {
  sessionId: string;
  status: "running" | "done" | "error";
  result: ResearchResult;
};

export type ResearchBindings = {
  secret: string;
  allowedOrigin: string;
  runQuick: (input: { query: string; documentContext?: string }) => Promise<ResearchResult>;
  startDeep: (input: { query: string; documentContext?: string }) => Promise<DeepStartResponse>;
  getDeep: (sessionId: string) => Promise<ResearchResult | null>;
  cancelDeep: (sessionId: string) => Promise<{ status: "cancelled" } | null>;
};

function corsHeaders(origin: string | null, allowedOrigin: string) {
  const allow = allowedOrigin === "*" ? origin ?? "*" : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type, x-research-kernel-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function readQuery(request: Request) {
  try {
    const payload = (await request.json()) as { query?: unknown; documentContext?: unknown };
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    const documentContext =
      typeof payload.documentContext === "string" ? payload.documentContext : undefined;
    return { query, documentContext };
  } catch {
    return { query: "", documentContext: undefined };
  }
}

export async function handleResearchRequest(request: Request, bindings: ResearchBindings): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, bindings.allowedOrigin);
  if (origin && bindings.allowedOrigin !== "*" && origin !== bindings.allowedOrigin) {
    return json(403, { error: "Origin not allowed" }, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!bindings.secret || request.headers.get("x-research-kernel-secret") !== bindings.secret) {
    return json(401, { error: "Unauthorized" }, headers);
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "POST" && path.endsWith("/quick_research")) {
    const { query, documentContext } = await readQuery(request);
    if (!query) return json(400, { error: "query is required" }, headers);
    try {
      return json(200, await bindings.runQuick({ query, documentContext }), headers);
    } catch (error) {
      return json(502, { error: "Quick research failed", detail: String(error) }, headers);
    }
  }

  if (request.method === "POST" && path.endsWith("/deep_research/start")) {
    const { query, documentContext } = await readQuery(request);
    if (!query) return json(400, { error: "query is required" }, headers);
    try {
      return json(200, await bindings.startDeep({ query, documentContext }), headers);
    } catch (error) {
      return json(502, { error: "Deep research failed to start", detail: String(error) }, headers);
    }
  }

  const deepMatch = path.match(/\/deep_research\/([^/]+)$/);
  const sessionId = deepMatch?.[1];
  if (sessionId && request.method === "GET") {
    const result = await bindings.getDeep(sessionId);
    if (!result) return json(404, { error: "Unknown session" }, headers);
    return json(200, result, headers);
  }

  const cancelMatch = path.match(/\/deep_research\/([^/]+)\/cancel$/);
  if (cancelMatch && request.method === "POST") {
    const cancelled = await bindings.cancelDeep(cancelMatch[1]);
    if (!cancelled) return json(404, { error: "Unknown session" }, headers);
    return json(200, cancelled, headers);
  }

  return json(404, { error: "Not found" }, headers);
}
