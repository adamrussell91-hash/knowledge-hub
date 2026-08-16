import { describe, expect, it } from "vitest";
import { appendCaptureBlock, titleFromCapture } from "./appendBlock";

describe("appendCaptureBlock", () => {
  it("writes a capture heading and text into an empty body", () => {
    expect(appendCaptureBlock("", { kind: "voice", filename: "voice.webm", text: "Hello archive" })).toBe(
      "## Capture — voice (voice.webm)\n\nHello archive\n",
    );
  });

  it("appends after existing markdown with a blank line", () => {
    expect(
      appendCaptureBlock("# Notes\n\nAlready here.\n", {
        kind: "photo",
        filename: "scan.png",
        text: "  Board text  ",
      }),
    ).toBe("# Notes\n\nAlready here.\n\n## Capture — photo (scan.png)\n\nBoard text\n");
  });
});

describe("titleFromCapture", () => {
  it("keeps a title the user already typed", () => {
    expect(titleFromCapture("  Lecture 3  ", { kind: "voice", text: "Ignored" })).toBe("  Lecture 3  ");
  });

  it("uses the first non-empty line of extract when title is blank", () => {
    expect(titleFromCapture("", { kind: "pdf", text: "\n  Duty of care\nNext line" })).toBe("Duty of care");
  });

  it("falls back to a dated kind label when extract is empty", () => {
    expect(titleFromCapture("   ", { kind: "voice", text: "", now: new Date("2026-08-15T00:00:00.000Z") })).toBe(
      "Voice note 2026-08-15",
    );
    expect(titleFromCapture("", { kind: "photo", text: "\n", now: new Date("2026-08-15T00:00:00.000Z") })).toBe(
      "Photo note 2026-08-15",
    );
    expect(titleFromCapture("", { kind: "pdf", text: "", now: new Date("2026-08-15T00:00:00.000Z") })).toBe(
      "PDF note 2026-08-15",
    );
  });

  it("truncates a long first line to 80 characters", () => {
    const line = "A".repeat(90);
    expect(titleFromCapture("", { kind: "voice", text: line })).toHaveLength(80);
  });
});
