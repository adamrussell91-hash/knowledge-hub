import { describe, expect, it, vi } from "vitest";
import { liveExtract, OCR_INSTRUCTION, WHISPER_MODEL } from "./live";

describe("liveExtract", () => {
  it("runs whisper for audio objects", async () => {
    const run = vi.fn(async () => ({ text: "spoken" }));
    const extract = liveExtract({
      ARCHIVE: {
        get: async () => ({
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          httpMetadata: { contentType: "audio/webm" },
        }),
      },
      AI: { run },
    });
    await expect(extract("notes/page_hub_aa/v.webm")).resolves.toMatchObject({ text: "spoken", kind: "voice" });
    expect(run).toHaveBeenCalledWith(WHISPER_MODEL, expect.objectContaining({ task: "transcribe", language: "en" }));
  });

  it("503s when Workers AI is missing", async () => {
    const extract = liveExtract({
      ARCHIVE: {
        get: async () => ({
          arrayBuffer: async () => new ArrayBuffer(1),
          httpMetadata: { contentType: "audio/webm" },
        }),
      },
    });
    await expect(extract("notes/page_hub_aa/v.webm")).rejects.toMatchObject({ status: 503 });
  });

  it("sends Claude an image transcribe prompt", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "board" }] }),
    }));
    const extract = liveExtract(
      {
        ARCHIVE: {
          get: async () => ({
            arrayBuffer: async () => new Uint8Array([9]).buffer,
            httpMetadata: { contentType: "image/png" },
          }),
        },
        ANTHROPIC_API_KEY: "sk-test",
      },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(extract("notes/page_hub_aa/s.png")).resolves.toMatchObject({ text: "board", kind: "photo" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(JSON.stringify(body)).toContain(OCR_INSTRUCTION);
    expect(body.model).toBe("claude-sonnet-4-6");
  });
});
