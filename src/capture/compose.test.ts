import { describe, expect, it, vi } from "vitest";
import {
  captureContentType,
  captureControlState,
  captureFieldHtml,
  captureFileName,
  ingestCaptureFile,
} from "./compose";

describe("capture file helpers", () => {
  it("names voice files from the mime and stamp", () => {
    const now = new Date("2026-08-15T05:22:00.000Z");
    expect(captureFileName("voice", new File([], "", { type: "audio/webm" }), now)).toBe(
      "voice-2026-08-15T05-22-00-000Z.webm",
    );
    expect(captureFileName("voice", new File([], "", { type: "audio/mp4" }), now)).toBe(
      "voice-2026-08-15T05-22-00-000Z.m4a",
    );
  });

  it("keeps a photo or pdf filename when present", () => {
    expect(captureFileName("photo", new File([], "board.png", { type: "image/png" }))).toBe("board.png");
    expect(captureFileName("pdf", new File([], "notes.pdf", { type: "application/pdf" }))).toBe("notes.pdf");
  });

  it("falls back to mime from kind", () => {
    expect(captureContentType("pdf", new File([], "x"))).toBe("application/pdf");
    expect(captureContentType("photo", new File([], "x"))).toBe("image/jpeg");
    expect(captureContentType("voice", new File([], "x"))).toBe("audio/webm");
    expect(captureContentType("photo", new File([], "x", { type: "image/png" }))).toBe("image/png");
  });
});

describe("captureFieldHtml", () => {
  it("renders Voice Photo PDF actions", () => {
    const html = captureFieldHtml({ busy: false, captureBusy: false, recording: false, localData: false });
    expect(html).toContain("data-capture-voice");
    expect(html).toContain("data-capture-photo");
    expect(html).toContain("data-capture-pdf");
    expect(html).toContain(">Voice<");
  });

  it("disables actions while capturing and labels Stop while recording", () => {
    expect(captureControlState({ busy: false, captureBusy: true, recording: false, localData: false })).toEqual({
      captureDisabled: "disabled",
      captureOthersDisabled: "disabled",
      voiceLabel: "Capturing…",
    });
    expect(captureControlState({ busy: false, captureBusy: false, recording: true, localData: false })).toMatchObject({
      captureOthersDisabled: "disabled",
      voiceLabel: "Stop",
    });
  });
});

describe("ingestCaptureFile", () => {
  it("uploads, extracts, and appends a capture block", async () => {
    const result = await ingestCaptureFile(
      {
        file: new File(["hi"], "voice.webm", { type: "audio/webm" }),
        kind: "voice",
        pageId: "page_hub_aa",
        area: "notes",
        body: "",
        title: "",
      },
      {
        signAttachment: async () => ({
          put_url: "https://r2.test/put",
          attachment: { filename: "voice.webm", r2_key: "notes/page_hub_aa/voice.webm" },
        }),
        uploadSignedFile: async () => undefined,
        runCapture: async () => ({ text: "spoken line" }),
      },
    );
    expect(result).toMatchObject({
      ok: true,
      title: "spoken line",
      toast: "Captured",
    });
    if (result.ok) {
      expect(result.body).toContain("## Capture — voice (voice.webm)");
      expect(result.body).toContain("spoken line");
    }
  });

  it("keeps the attachment when extract fails after PUT", async () => {
    const result = await ingestCaptureFile(
      {
        file: new File(["hi"], "voice.webm", { type: "audio/webm" }),
        kind: "voice",
        pageId: "page_hub_aa",
        area: "notes",
        body: "",
        title: "Keep me",
      },
      {
        signAttachment: async () => ({
          put_url: "https://r2.test/put",
          attachment: { filename: "voice.webm", r2_key: "notes/page_hub_aa/voice.webm" },
        }),
        uploadSignedFile: async () => undefined,
        runCapture: async () => {
          throw new Error("Capture is unavailable");
        },
      },
    );
    expect(result).toEqual({
      ok: false,
      toast: "Capture is unavailable",
      attachment: { filename: "voice.webm", r2_key: "notes/page_hub_aa/voice.webm" },
    });
  });

  it("skips local preview without calling the API", async () => {
    const signAttachment = vi.fn();
    const result = await ingestCaptureFile(
      {
        file: new File(["hi"], "voice.webm", { type: "audio/webm" }),
        kind: "voice",
        pageId: "page_hub_aa",
        area: "notes",
        body: "",
        title: "",
      },
      { signAttachment, uploadSignedFile: async () => undefined, runCapture: async () => ({ text: "" }), localData: true },
    );
    expect(result.ok).toBe(false);
    expect(signAttachment).not.toHaveBeenCalled();
  });
});
