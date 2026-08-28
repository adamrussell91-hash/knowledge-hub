import type { BackgroundHandler } from "@netlify/functions";
import { completeChatWrite } from "../../src/chat/completeWrite";
import type { ChatMessage } from "../../src/chat/messages";
import { getChatWrite, isBookWriteSessionId, putChatWrite } from "./_lib/chatWriteStore";

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

/**
 * Background function: Netlify returns 202 to the caller immediately, then this
 * keeps running (up to ~15 minutes) so Anthropic web_search is not killed at 26s.
 */
export const handler: BackgroundHandler = async event => {
  const secret = process.env.RESEARCH_KERNEL_SHARED_SECRET ?? "";
  if (!secret || event.headers["x-research-kernel-secret"] !== secret) {
    return;
  }
  let writeSessionId = "";
  try {
    const payload = JSON.parse(event.body || "{}") as {
      writeSessionId?: unknown;
      system?: unknown;
      messages?: unknown;
      maxTokens?: unknown;
    };
    writeSessionId = typeof payload.writeSessionId === "string" ? payload.writeSessionId : "";
    const system = typeof payload.system === "string" ? payload.system : "";
    const messages = readMessages(payload.messages);
    const maxTokens =
      typeof payload.maxTokens === "number" && payload.maxTokens > 0 ? payload.maxTokens : undefined;
    if (!isBookWriteSessionId(writeSessionId) || !system.trim() || !messages.length) return;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await putChatWrite({
        writeSessionId,
        status: "error",
        error: "Book note web research is not configured",
      });
      return;
    }

    const prior = await getChatWrite(writeSessionId);
    const reply = await completeChatWrite({
      system,
      messages,
      maxTokens,
      apiKey,
      webSearch: true,
    });
    await putChatWrite({
      writeSessionId,
      status: "done",
      reply,
      research: prior?.research,
      archiveFailed: prior?.archiveFailed,
    });
  } catch (error) {
    if (!writeSessionId) return;
    await putChatWrite({
      writeSessionId,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
};
