import type { ChatMessage } from "./messages";

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
} as const;

type ContentBlock = { type: string; text?: string };

/** Keep the final answer text after any server-tool blocks (web search runs mid-turn). */
export function extractAssistantText(content: ContentBlock[] | undefined): string {
  if (!content?.length) return "";
  let lastTool = -1;
  content.forEach((block, index) => {
    if (block.type !== "text") lastTool = index;
  });
  return content
    .slice(lastTool + 1)
    .filter(block => block.type === "text" && block.text)
    .map(block => block.text!)
    .join("");
}

export async function completeChatWrite(input: {
  system: string;
  messages: ChatMessage[];
  apiKey: string;
  maxTokens?: number;
  webSearch?: boolean;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    model: input.model ?? "claude-sonnet-4-6",
    max_tokens: input.maxTokens ?? 2000,
    system: input.system,
    messages: input.messages,
  };
  if (input.webSearch) {
    body.tools = [WEB_SEARCH_TOOL];
  }
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: ContentBlock[] };
  return extractAssistantText(payload.content);
}
