import { describe, expect, it } from "vitest";
import {
  assertCaptureKey,
  captureKindFromContentType,
  parseClaudeText,
  parseToMarkdownResult,
  parseWhisperResult,
  runExtract,
} from "./extract";

describe("assertCaptureKey", () => {
  it("accepts notes and university attachment keys", () => {
    expect(assertCaptureKey("notes/page_hub_aa/voice.webm")).toBe("notes/page_hub_aa/voice.webm");
    expect(assertCaptureKey("university/page_hub_aa/scan.png")).toBe("university/page_hub_aa/scan.png");
  });

  it("rejects traversal and other prefixes", () => {
    expect(() => assertCaptureKey("research/pages/x.json")).toThrow(/r2_key/);
    expect(() => assertCaptureKey("notes/../secret")).toThrow(/r2_key/);
    expect(() => assertCaptureKey("notes/page/dir/file.pdf")).toThrow(/r2_key/);
    expect(() => assertCaptureKey("")).toThrow(/r2_key/);
  });
});

describe("captureKindFromContentType", () => {
  it("maps mime to capture kind", () => {
    expect(captureKindFromContentType("audio/webm", "a.webm")).toBe("voice");
    expect(captureKindFromContentType("image/png", "a.png")).toBe("photo");
    expect(captureKindFromContentType("application/pdf", "a.pdf")).toBe("pdf");
    expect(captureKindFromContentType("application/octet-stream", "notes.pdf")).toBe("pdf");
    expect(captureKindFromContentType("text/plain", "a.txt")).toBeNull();
  });
});

describe("parsers", () => {
  it("reads whisper text from several shapes", () => {
    expect(parseWhisperResult("plain")).toBe("plain");
    expect(parseWhisperResult({ text: "  hi  " })).toBe("hi");
    expect(parseWhisperResult({ transcription: { text: "there" } })).toBe("there");
    expect(parseWhisperResult({})).toBe("");
  });

  it("joins toMarkdown data fields", () => {
    expect(parseToMarkdownResult([{ data: "Page 1" }, { data: "Page 2" }])).toBe("Page 1\n\nPage 2");
    expect(parseToMarkdownResult({ data: "solo" })).toBe("solo");
  });

  it("reads Claude text blocks", () => {
    expect(parseClaudeText({ content: [{ type: "text", text: "Board" }] })).toBe("Board");
    expect(parseClaudeText({ content: [{ type: "tool_use" }] })).toBe("");
  });
});

describe("runExtract", () => {
  it("transcribes audio, converts pdf, and ocrs images", async () => {
    const getObject = async (key: string) => {
      if (key.endsWith(".webm")) return { bytes: new Uint8Array([1]).buffer, contentType: "audio/webm", filename: "v.webm" };
      if (key.endsWith(".pdf")) return { bytes: new Uint8Array([2]).buffer, contentType: "application/pdf", filename: "a.pdf" };
      if (key.endsWith(".png")) return { bytes: new Uint8Array([3]).buffer, contentType: "image/png", filename: "s.png" };
      return null;
    };
    expect(
      await runExtract({
        r2_key: "notes/page_hub_aa/v.webm",
        getObject,
        transcribe: async () => ({ text: "spoken" }),
        toMarkdown: async () => [{ data: "pdf body" }],
        ocr: async () => ({ content: [{ type: "text", text: "photo body" }] }),
      }),
    ).toEqual({ kind: "voice", filename: "v.webm", text: "spoken" });
    expect(
      await runExtract({
        r2_key: "notes/page_hub_aa/a.pdf",
        getObject,
        transcribe: async () => ({ text: "no" }),
        toMarkdown: async () => [{ data: "pdf body" }],
        ocr: async () => ({ content: [{ type: "text", text: "no" }] }),
      }),
    ).toEqual({ kind: "pdf", filename: "a.pdf", text: "pdf body" });
    expect(
      await runExtract({
        r2_key: "notes/page_hub_aa/s.png",
        getObject,
        transcribe: async () => ({ text: "no" }),
        toMarkdown: async () => [{ data: "no" }],
        ocr: async () => ({ content: [{ type: "text", text: "photo body" }] }),
      }),
    ).toEqual({ kind: "photo", filename: "s.png", text: "photo body" });
  });

  it("throws when the object is missing or unsupported", async () => {
    await expect(
      runExtract({
        r2_key: "notes/page_hub_aa/missing.webm",
        getObject: async () => null,
        transcribe: async () => ({}),
        toMarkdown: async () => [],
        ocr: async () => ({}),
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      runExtract({
        r2_key: "notes/page_hub_aa/x.bin",
        getObject: async () => ({ bytes: new ArrayBuffer(1), contentType: "application/octet-stream", filename: "x.bin" }),
        transcribe: async () => ({}),
        toMarkdown: async () => [],
        ocr: async () => ({}),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
