import type { Handler } from "@netlify/functions";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";
import { loadPromptFile } from "../../src/clementine/loadFromDisk";
import { runCoachTurn, type CoachMessage } from "../../src/clementine/coachTurn";

const DEFAULT_KERNEL_URL = "https://knowledge-hub-research.adamrussell91.workers.dev";

function parseBody(raw: string | null): {
  messages: CoachMessage[];
  workingThesis?: string;
  draft?: string;
} | null {
  try {
    const parsed = JSON.parse(raw ?? "{}") as {
      messages?: unknown;
      workingThesis?: unknown;
      draft?: unknown;
    };
    if (!Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter(
      (item): item is CoachMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as CoachMessage).role === "user" || (item as CoachMessage).role === "assistant") &&
        typeof (item as CoachMessage).content === "string",
    );
    if (!messages.length) return null;
    return {
      messages,
      workingThesis: typeof parsed.workingThesis === "string" ? parsed.workingThesis : undefined,
      draft: typeof parsed.draft === "string" ? parsed.draft : undefined,
    };
  } catch {
    return null;
  }
}

async function completeWithAnthropic(system: string, messages: CoachMessage[], apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "messages are required" }) };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Coach is unavailable" }) };
  }
  try {
    const kernelUrl = process.env.RESEARCH_KERNEL_URL || DEFAULT_KERNEL_URL;
    const kernelSecret = process.env.RESEARCH_KERNEL_SHARED_SECRET;
    const result = await runCoachTurn({
      voice: loadPromptFile("clementine-voice.md"),
      universityJob: loadPromptFile("clementine-university.md"),
      messages: body.messages,
      workingThesis: body.workingThesis,
      draft: body.draft,
      kernel: kernelSecret
        ? { url: kernelUrl, secret: kernelSecret, fetchImpl: fetch }
        : undefined,
      complete: (system, messages) => completeWithAnthropic(system, messages, apiKey),
    });
    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        reply: result.reply,
        research: result.research,
        archiveFailed: result.archiveFailed ?? false,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Prompt file missing:")) {
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: message }) };
    }
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Coach turn failed" }) };
  }
};
