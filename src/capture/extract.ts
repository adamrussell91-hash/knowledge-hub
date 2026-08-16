import type { CaptureKind } from "./appendBlock";

const KEY = /^(notes|university)\/[A-Za-z0-9_-]+\/[^/]+$/;

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function assertCaptureKey(raw: unknown) {
  if (typeof raw !== "string" || !KEY.test(raw) || raw.includes("..")) {
    throw new CaptureError("r2_key must be notes|university/<page>/<file>", 400);
  }
  return raw;
}

export function captureKindFromContentType(contentType: string, filename: string): CaptureKind | null {
  const type = contentType.toLowerCase();
  const name = filename.toLowerCase();
  if (type.startsWith("audio/") || /\.(webm|m4a|mp3|mp4|wav|ogg)$/.test(name)) return "voice";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) return "photo";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return null;
}

export function parseWhisperResult(raw: unknown) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  const record = raw as { text?: unknown; transcription?: { text?: unknown } };
  if (typeof record.text === "string") return record.text.trim();
  if (typeof record.transcription?.text === "string") return record.transcription.text.trim();
  return "";
}

export function parseToMarkdownResult(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw
      .map(item => (item && typeof item === "object" && typeof (item as { data?: unknown }).data === "string" ? (item as { data: string }).data.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  if (raw && typeof raw === "object" && typeof (raw as { data?: unknown }).data === "string") {
    return (raw as { data: string }).data.trim();
  }
  return "";
}

export function parseClaudeText(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const content = (raw as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap(block => {
      if (!block || typeof block !== "object") return [];
      const item = block as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string" ? [item.text.trim()] : [];
    })
    .filter(Boolean)
    .join("\n");
}

export type CaptureObject = {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
};

export async function runExtract(input: {
  r2_key: string;
  getObject: (key: string) => Promise<CaptureObject | null>;
  transcribe: (bytes: ArrayBuffer, contentType: string) => Promise<unknown>;
  toMarkdown: (input: { name: string; bytes: ArrayBuffer; contentType: string }) => Promise<unknown>;
  ocr: (bytes: ArrayBuffer, contentType: string) => Promise<unknown>;
}) {
  const key = assertCaptureKey(input.r2_key);
  const object = await input.getObject(key);
  if (!object) throw new CaptureError("Attachment not found", 404);
  const kind = captureKindFromContentType(object.contentType, object.filename);
  if (!kind) throw new CaptureError("unsupported capture type", 400);
  const text =
    kind === "voice"
      ? parseWhisperResult(await input.transcribe(object.bytes, object.contentType))
      : kind === "pdf"
        ? parseToMarkdownResult(
            await input.toMarkdown({ name: object.filename, bytes: object.bytes, contentType: object.contentType }),
          )
        : parseClaudeText(await input.ocr(object.bytes, object.contentType));
  return { kind, filename: object.filename, text };
}
