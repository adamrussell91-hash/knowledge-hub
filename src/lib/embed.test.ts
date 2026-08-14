import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAI_EMBEDDINGS_MODEL, OPENAI_EMBEDDINGS_URL, embedTexts } from "./embed";

describe("embedTexts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls OpenAI embeddings, not Voyage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0.2] },
          { index: 0, embedding: [0.1] },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(embedTexts(["alpha", "beta"], "sk-test")).resolves.toEqual([[0.1], [0.2]]);

    expect(fetchMock).toHaveBeenCalledWith(
      OPENAI_EMBEDDINGS_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      }),
    );
    expect(OPENAI_EMBEDDINGS_URL).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      input: ["alpha", "beta"],
      model: OPENAI_EMBEDDINGS_MODEL,
    });
    expect(OPENAI_EMBEDDINGS_MODEL).toBe("text-embedding-3-small");
    expect(fetchMock.mock.calls[0][0]).not.toContain("voyageai");
  });

  it("retries after a 429 rate limit", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "1" : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: [0.5] }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(embedTexts(["alpha"], "sk-test", { sleep })).resolves.toEqual([[0.5]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(20000);
  });
});
