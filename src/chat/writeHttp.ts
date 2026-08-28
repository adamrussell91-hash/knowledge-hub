import type { ChatMessage } from "./messages";
import type { ResearchResult } from "../research/schema";

export type ChatWriteStatus = "writing" | "done" | "error";

export type ChatWriteStartInput = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  research?: ResearchResult;
  archiveFailed?: boolean;
  webSearch?: boolean;
};

export type ChatWriteState = {
  writeSessionId: string;
  status: ChatWriteStatus;
  reply?: string;
  error?: string;
  research?: ResearchResult;
  archiveFailed?: boolean;
};

export type ChatWriteBindings = {
  secret: string;
  allowedOrigin: string;
  startWrite: (input: ChatWriteStartInput) => Promise<ChatWriteState>;
  getWrite: (writeSessionId: string) => Promise<ChatWriteState | null>;
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

function readMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ChatMessage =>
      Boolean(item) &&
      typeof item === "object" &&
      ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
      typeof (item as ChatMessage).content === "string",
  );
}

async function readStart(request: Request): Promise<ChatWriteStartInput | null> {
  try {
    const payload = (await request.json()) as {
      system?: unknown;
      messages?: unknown;
      maxTokens?: unknown;
      research?: ResearchResult;
      archiveFailed?: unknown;
      webSearch?: unknown;
    };
    const system = typeof payload.system === "string" ? payload.system : "";
    const messages = readMessages(payload.messages);
    if (!system.trim() || !messages.length) return null;
    return {
      system,
      messages,
      maxTokens: typeof payload.maxTokens === "number" && payload.maxTokens > 0 ? payload.maxTokens : undefined,
      research: payload.research,
      archiveFailed: payload.archiveFailed === true,
      webSearch: payload.webSearch === true,
    };
  } catch {
    return null;
  }
}

export async function handleChatWriteRequest(request: Request, bindings: ChatWriteBindings): Promise<Response> {
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

  if (request.method === "POST" && path.endsWith("/chat/write/start")) {
    const input = await readStart(request);
    if (!input) return json(400, { error: "system and messages are required" }, headers);
    try {
      return json(200, await bindings.startWrite(input), headers);
    } catch (error) {
      return json(502, { error: "Chat write failed to start", detail: String(error) }, headers);
    }
  }

  const match = path.match(/\/chat\/write\/([^/]+)$/);
  if (match && request.method === "GET") {
    const state = await bindings.getWrite(match[1]);
    if (!state) return json(404, { error: "Unknown write session" }, headers);
    return json(200, state, headers);
  }

  return json(404, { error: "Not found" }, headers);
}
