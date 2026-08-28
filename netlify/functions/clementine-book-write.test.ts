import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handler } from "./clementine-book-write";

const putChatWrite = vi.fn();
const getChatWrite = vi.fn();
const completeChatWrite = vi.fn();

vi.mock("./_lib/chatWriteStore", () => ({
  isBookWriteSessionId: (id: string) => id.startsWith("book_"),
  putChatWrite: (...args: unknown[]) => putChatWrite(...args),
  getChatWrite: (...args: unknown[]) => getChatWrite(...args),
}));

vi.mock("../../src/chat/completeWrite", () => ({
  completeChatWrite: (...args: unknown[]) => completeChatWrite(...args),
}));

describe("clementine-book-write background handler", () => {
  beforeEach(() => {
    process.env.RESEARCH_KERNEL_SHARED_SECRET = "kernel";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    putChatWrite.mockReset();
    getChatWrite.mockReset();
    completeChatWrite.mockReset();
    getChatWrite.mockResolvedValue({ writeSessionId: "book_1", status: "writing" });
    putChatWrite.mockImplementation(async (state: unknown) => state);
    completeChatWrite.mockResolvedValue("## Weak absolutism\n\nFrom the open web.");
  });

  afterEach(() => {
    delete process.env.RESEARCH_KERNEL_SHARED_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("runs web_search and stores the done reply", async () => {
    await handler(
      {
        headers: { "x-research-kernel-secret": "kernel" },
        body: JSON.stringify({
          writeSessionId: "book_1",
          system: "From a book protocol",
          messages: [{ role: "user", content: "Weak absolutism" }],
          maxTokens: 3500,
        }),
      } as never,
      {} as never,
    );
    expect(completeChatWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        webSearch: true,
        apiKey: "anthropic-key",
        maxTokens: 3500,
        system: "From a book protocol",
      }),
    );
    expect(putChatWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        writeSessionId: "book_1",
        status: "done",
        reply: "## Weak absolutism\n\nFrom the open web.",
      }),
    );
  });

  it("ignores unauthorized kicks", async () => {
    await handler(
      {
        headers: { "x-research-kernel-secret": "wrong" },
        body: JSON.stringify({
          writeSessionId: "book_1",
          system: "x",
          messages: [{ role: "user", content: "y" }],
        }),
      } as never,
      {} as never,
    );
    expect(completeChatWrite).not.toHaveBeenCalled();
  });
});
