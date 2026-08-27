import type { Handler } from "@netlify/functions";
import { cors, preflight, requestOrigin } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";
import { loadPromptFile } from "../../src/clementine/loadFromDisk";
import { runChatTurn, type ChatMessage } from "../../src/chat/chatTurn";
import { isChatHatId, type ChatDepth, type ChatScope } from "../../src/chat/hats";
import { normalizeBookContext } from "../../src/chat/bookNote";
import { isChatPersonalityId, personalityById } from "../../src/chat/personalities";
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
      notesInPlay?: unknown;
      bookContext?: unknown;
      personality?: unknown;
      searchOutside?: unknown;
      researchSessionId?: unknown;
      writeSessionId?: unknown;
      compose?: unknown;
      priorResearch?: unknown;
      sittingLibrary?: unknown;
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
    const asNote = (value: unknown) =>
      value &&
      typeof value === "object" &&
      typeof (value as { pageId?: unknown }).pageId === "string" &&
      typeof (value as { title?: unknown }).title === "string"
        ? { pageId: (value as { pageId: string }).pageId, title: (value as { title: string }).title }
        : undefined;
    const note = asNote(parsed.noteContext);
    const notesInPlay = Array.isArray(parsed.notesInPlay)
      ? parsed.notesInPlay.map(asNote).filter((item): item is { pageId: string; title: string } => Boolean(item))
      : undefined;
    const bookContext = normalizeBookContext(parsed.bookContext);
    return {
      messages,
      hat: parsed.hat,
      scope: typeof parsed.scope === "string" ? (parsed.scope as ChatScope) : undefined,
      depth: typeof parsed.depth === "string" ? (parsed.depth as ChatDepth) : undefined,
      workingThesis: typeof parsed.workingThesis === "string" ? parsed.workingThesis : undefined,
      draft: typeof parsed.draft === "string" ? parsed.draft : undefined,
      noteContext: note,
      notesInPlay,
      bookContext,
      personality: typeof parsed.personality === "string" && isChatPersonalityId(parsed.personality) ? parsed.personality : undefined,
      searchOutside: parsed.searchOutside === true,
      researchSessionId: typeof parsed.researchSessionId === "string" ? parsed.researchSessionId : undefined,
      writeSessionId: typeof parsed.writeSessionId === "string" ? parsed.writeSessionId : undefined,
      compose: parsed.compose === true,
      priorResearch: ResearchResultSchema.safeParse(parsed.priorResearch).data,
      sittingLibrary: ResearchResultSchema.safeParse(parsed.sittingLibrary).data,
      archiveFailed: parsed.archiveFailed === true,
    };
  } catch {
    return null;
  }
}

export const handler: Handler = async event => {
  const origin = requestOrigin(event.headers);
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(origin), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const body = parseBody(event.body);
  if (!body) {
    return { statusCode: 400, headers: cors(origin), body: JSON.stringify({ error: "hat and messages are required" }) };
  }
  const kernelUrl = (process.env.RESEARCH_KERNEL_URL || DEFAULT_KERNEL_URL).replace(/\/+$/, "");
  const kernelSecret = process.env.RESEARCH_KERNEL_SHARED_SECRET;
  if (!kernelSecret) {
    return { statusCode: 503, headers: cors(origin), body: JSON.stringify({ error: "Chat write clock is not configured" }) };
  }
  try {
    const who = personalityById(body.personality ?? "clementine") ?? personalityById("clementine")!;
    const result = await runChatTurn({
      voice: loadPromptFile(who.voiceFile),
      universityJob: loadPromptFile("clementine-university.md"),
      hat: body.hat,
      scope: body.scope,
      depth: body.depth,
      messages: body.messages,
      workingThesis: body.workingThesis,
      draft: body.draft,
      noteContext: body.noteContext,
      notesInPlay: body.notesInPlay,
      bookContext: body.bookContext,
      searchOutside: body.searchOutside,
      researchSessionId: body.researchSessionId,
      writeSessionId: body.writeSessionId,
      compose: body.compose,
      priorResearch: body.priorResearch,
      sittingLibrary: body.sittingLibrary,
      archiveFailed: body.archiveFailed,
      kernel: { url: kernelUrl, secret: kernelSecret, fetchImpl: fetch },
      archivePull: pullLiveArchive,
      write: {
        start: async input => {
          const response = await fetch(`${kernelUrl}/chat/write/start`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-research-kernel-secret": kernelSecret,
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(8_000),
          });
          if (response.status === 404) throw new Error("Chat write clock is not deployed on the Worker");
          if (!response.ok) throw new Error(`Write start failed ${response.status}`);
          return response.json();
        },
        poll: async writeSessionId => {
          const response = await fetch(`${kernelUrl}/chat/write/${encodeURIComponent(writeSessionId)}`, {
            headers: { "x-research-kernel-secret": kernelSecret },
            signal: AbortSignal.timeout(8_000),
          });
          if (response.status === 404) return null;
          if (!response.ok) throw new Error(`Write poll failed ${response.status}`);
          return response.json();
        },
      },
    });
    return { statusCode: 200, headers: cors(origin), body: JSON.stringify(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Prompt file missing:")) {
      return { statusCode: 500, headers: cors(origin), body: JSON.stringify({ error: message }) };
    }
    if (/write clock is not deployed/i.test(message)) {
      return { statusCode: 503, headers: cors(origin), body: JSON.stringify({ error: message }) };
    }
    return { statusCode: 502, headers: cors(origin), body: JSON.stringify({ error: "Chat turn failed" }) };
  }
};
