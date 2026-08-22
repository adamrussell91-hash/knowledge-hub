import type { ChatMessage } from "./messages";

export async function completeChatWrite(input: {
  system: string;
  messages: ChatMessage[];
  apiKey: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model ?? "claude-sonnet-4-6",
      max_tokens: input.maxTokens ?? 2000,
      system: input.system,
      messages: input.messages,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  return payload.content?.find(block => block.type === "text")?.text ?? "";
}
