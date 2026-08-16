import { CaptureError } from "./extract";

export type CaptureExtractResult = { kind: string; filename: string; text: string };

export type CaptureBindings = {
  secret: string;
  allowedOrigin: string;
  extract: (r2Key: string) => Promise<CaptureExtractResult>;
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

export async function handleCaptureRequest(request: Request, bindings: CaptureBindings): Promise<Response> {
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
  if (!(request.method === "POST" && path.endsWith("/capture"))) {
    return json(404, { error: "Not found" }, headers);
  }
  let r2Key = "";
  try {
    const payload = (await request.json()) as { r2_key?: unknown };
    r2Key = typeof payload.r2_key === "string" ? payload.r2_key : "";
  } catch {
    return json(400, { error: "Invalid JSON" }, headers);
  }
  if (!r2Key) return json(400, { error: "r2_key is required" }, headers);
  try {
    const result = await bindings.extract(r2Key);
    return json(200, { text: result.text }, headers);
  } catch (error) {
    const status = error instanceof CaptureError ? error.status : typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 502;
    const message = error instanceof Error ? error.message : "Capture failed";
    return json(status, { error: message }, headers);
  }
}
