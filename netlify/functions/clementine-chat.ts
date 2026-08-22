import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";
import { loadPromptFile } from "../../src/clementine/loadFromDisk";
import { runChatTurn, type ChatMessage } from "../../src/chat/chatTurn";
import { isChatHatId, type ChatDepth, type ChatScope } from "../../src/chat/hats";
import { ResearchResultSchema } from "../../src/research/schema";
import { pullLiveArchive } from "./_lib/liveArchive";

const DEFAULT_KERNEL_URL = "https://knowledge-hub-research.adamrussell91.workers.dev";

function parseBody(raw: string | null) {
  try {
    const parsed = JSON.parse(raw ?? "{}") as {
      messages?: unknown;
      hat?: unknown;
      scope?: unknown;
      depth?: unknown;
      workingThesis?: unknown;
      draft?: unknown;
      noteContext?: unknown;
      searchOutside?: unknown;
      researchSessionId?: unknown;
      compose?: unknown;
      priorResearch?: unknown;
      archiveFailed?: unknown;
    };
    if (!Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter(
      (item): item is ChatMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
        typeof (item as ChatMessage).content === "string",
    );
    if (!messages.length) return null;
    if (typeof parsed.hat !== "string" || !isChatHatId(parsed.hat)) return null;
    const note =
      parsed.noteContext &&
      typeof parsed.noteContext === "object" &&
      typeof (parsed.noteContext as { pageId?: unknown }).pageId === "string" &&
      typeof (parsed.noteContext as { title?: unknown }).title === "string"
        ? { pageId: (parsed.noteContext as { pageId: string }).pageId, title: (parsed.noteContext as { title: string }).title }
        : undefined;
    return {
      messages,
      hat: parsed.hat,
      scope: typeof parsed.scope === "string" ? (parsed.scope as ChatScope) : undefined,
      depth: typeof parsed.depth === "string" ? (parsed.depth as ChatDepth) : undefined,
      workingThesis: typeof parsed.workingThesis === "string" ? parsed.workingThesis : undefined,
      draft: typeof parsed.draft === "string" ? parsed.draft : undefined,
      noteContext: note,
      searchOutside: parsed.searchOutside === true,
      researchSessionId: typeof parsed.researchSessionId === "string" ? parsed.researchSessionId : undefined,
      compose: parsed.compose === true,
      priorResearch: ResearchResultSchema.safeParse(parsed.priorResearch).data,
      archiveFailed: parsed.archiveFailed === true,
    };
  } catch {
    return null;
  }
}

async function completeWithAnthropic(system: string, messages: ChatMessage[], apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  return payload.content?.find(block => block.type === "text")?.text ?? "";
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const body = parseBody(event.body);
  if (!body) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "hat and messages are required" }) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Chat is unavailable" }) };
  }
  try {
    const kernelUrl = process.env.RESEARCH_KERNEL_URL || DEFAULT_KERNEL_URL;
    const kernelSecret = process.env.RESEARCH_KERNEL_SHARED_SECRET;
    const result = await runChatTurn({
      voice: loadPromptFile("clementine-voice.md"),
      universityJob: loadPromptFile("clementine-university.md"),
      hat: body.hat,
      scope: body.scope,
      depth: body.depth,
      messages: body.messages,
      workingThesis: body.workingThesis,
      draft: body.draft,
      noteContext: body.noteContext,
      searchOutside: body.searchOutside,
      researchSessionId: body.researchSessionId,
      compose: body.compose,
      priorResearch: body.priorResearch,
      archiveFailed: body.archiveFailed,
      kernel: kernelSecret ? { url: kernelUrl, secret: kernelSecret, fetchImpl: fetch } : undefined,
      archivePull: pullLiveArchive,
      complete: (system, messages) => completeWithAnthropic(system, messages, apiKey),
    });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Prompt file missing:")) {
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: message }) };
    }
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Chat turn failed" }) };
  }
};
