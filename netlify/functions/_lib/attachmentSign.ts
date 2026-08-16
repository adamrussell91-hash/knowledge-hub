import { createHash } from "node:crypto";
import { PageAreaSchema } from "../../../src/domain/page";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
  "application/octet-stream",
]);

export function uniqueFilename(filename: string, index: number) {
  if (index === 0) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return `${filename}-${index}`;
  return `${filename.slice(0, dot)}-${index}${filename.slice(dot)}`;
}

export function hubR2Key(area: "notes" | "university", pageId: string, filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  return `${area}/${pageId}/${safe}`;
}

export function attachmentKind(contentType: string, filename: string) {
  if (contentType === "application/pdf" || /\.pdf$/i.test(filename)) return "pdf" as const;
  if (contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename)) return "image" as const;
  if (contentType.startsWith("audio/") || /\.(webm|m4a|mp3|wav|ogg)$/i.test(filename)) return "audio" as const;
  return "file" as const;
}

export function parseSignRequest(raw: unknown) {
  if (!raw || typeof raw !== "object") return { error: "Invalid JSON" as const };
  const body = raw as Record<string, unknown>;
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const contentType = typeof body.content_type === "string" ? body.content_type : "";
  const byteSize = typeof body.byte_size === "number" ? body.byte_size : NaN;
  const pageId = typeof body.page_id === "string" ? body.page_id : "";
  const areaParse = PageAreaSchema.safeParse(body.area);
  if (!filename.includes(".")) return { error: "filename needs an extension" as const };
  if (!pageId) return { error: "page_id required" as const };
  if (!areaParse.success) return { error: "area must be notes or university" as const };
  if (!TYPES.has(contentType)) return { error: "content_type not allowed" as const };
  if (!Number.isFinite(byteSize) || byteSize < 1) return { error: "byte_size required" as const };
  if (byteSize > MAX_ATTACHMENT_BYTES) return { error: "File exceeds 20MB" as const };
  const r2Key = hubR2Key(areaParse.data, pageId, filename);
  const id = `attachment_${createHash("sha256").update(r2Key).digest("hex").slice(0, 12)}`;
  return {
    value: {
      filename,
      content_type: contentType,
      byte_size: byteSize,
      page_id: pageId,
      area: areaParse.data,
      attachment: {
        id,
        kind: attachmentKind(contentType, filename),
        r2_key: r2Key,
        filename,
        content_type: contentType,
      },
    },
  };
}
