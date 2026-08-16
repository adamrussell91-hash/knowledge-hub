import { CaptureError, runExtract, type CaptureObject } from "./extract";

export const OCR_INSTRUCTION =
  "Transcribe every readable word. Preserve line breaks. Do not summarize. If a diagram, describe labels only. Return plain text only.";

export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

type LiveEnv = {
  ARCHIVE: {
    get: (key: string) => Promise<{
      arrayBuffer: () => Promise<ArrayBuffer>;
      httpMetadata?: { contentType?: string };
    } | null>;
  };
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
    toMarkdown?: (files: { name: string; blob: Blob }[]) => Promise<unknown>;
  };
  ANTHROPIC_API_KEY?: string;
};

function bytesToBase64(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64");
}

export function liveExtract(env: LiveEnv, fetchImpl: typeof fetch = fetch) {
  return (r2Key: string) =>
    runExtract({
      r2_key: r2Key,
      getObject: async (key): Promise<CaptureObject | null> => {
        const object = await env.ARCHIVE.get(key);
        if (!object) return null;
        const filename = key.split("/").pop() ?? "capture.bin";
        return {
          bytes: await object.arrayBuffer(),
          contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
          filename,
        };
      },
      transcribe: async bytes => {
        if (!env.AI) throw new CaptureError("Capture is unavailable", 503);
        return env.AI.run(WHISPER_MODEL, {
          audio: bytesToBase64(bytes),
          task: "transcribe",
          language: "en",
        });
      },
      toMarkdown: async input => {
        if (!env.AI?.toMarkdown) throw new CaptureError("Capture is unavailable", 503);
        return env.AI.toMarkdown([
          { name: input.name, blob: new Blob([input.bytes], { type: input.contentType || "application/pdf" }) },
        ]);
      },
      ocr: async (bytes, contentType) => {
        if (!env.ANTHROPIC_API_KEY) throw new CaptureError("Capture is unavailable", 503);
        const mediaType = contentType.startsWith("image/") ? contentType : "image/png";
        const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data: bytesToBase64(bytes) },
                  },
                  { type: "text", text: OCR_INSTRUCTION },
                ],
              },
            ],
          }),
        });
        if (!response.ok) throw new CaptureError(`Anthropic error ${response.status}`, 502);
        return response.json();
      },
    });
}
