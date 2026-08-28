import { describe, expect, it, vi } from "vitest";
import { completeChatWrite, extractAssistantText, WEB_SEARCH_TOOL } from "./completeWrite";

describe("completeChatWrite", () => {
  it("keeps only the final text after web-search tool blocks", () => {
    expect(
      extractAssistantText([
        { type: "text", text: "I'll look that up." },
        { type: "server_tool_use", text: undefined },
        { type: "web_search_tool_result" },
        { type: "text", text: "Desirable difficulties " },
        { type: "text", text: "make practice stick." },
      ]),
    ).toBe("Desirable difficulties make practice stick.");
  });

  it("enables Anthropic web search when asked", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "Searching." },
          { type: "server_tool_use" },
          { type: "text", text: "## Desirable difficulties\n\nA clear page." },
        ],
      }),
    });
    const reply = await completeChatWrite({
      system: "Write a book note.",
      messages: [{ role: "user", content: "desirable difficulties" }],
      apiKey: "key",
      webSearch: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(reply).toBe("## Desirable difficulties\n\nA clear page.");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.tools).toEqual([WEB_SEARCH_TOOL]);
  });

  it("omits tools when web search is off", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "Archive brief." }] }),
    });
    await completeChatWrite({
      system: "Write.",
      messages: [{ role: "user", content: "hi" }],
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.tools).toBeUndefined();
  });
});
