import { describe, expect, it, vi } from "vitest";
import { AURA_MODEL, decodeAuraAudio, runAuraTts } from "./aura";

function bytesOf(values: number[]) {
  return new Uint8Array(values);
}

describe("decodeAuraAudio", () => {
  it("returns an ArrayBuffer unchanged", async () => {
    const source = bytesOf([1, 2, 3, 4]).buffer;
    const decoded = await decodeAuraAudio(source);
    expect(new Uint8Array(decoded)).toEqual(bytesOf([1, 2, 3, 4]));
  });

  it("decodes { audio: base64 }", async () => {
    const raw = bytesOf([9, 8, 7, 6]);
    const audio = btoa(String.fromCharCode(...raw));
    const decoded = await decodeAuraAudio({ audio });
    expect(new Uint8Array(decoded)).toEqual(raw);
  });

  it("reads a tiny ReadableStream of bytes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytesOf([10, 20, 30]));
        controller.close();
      },
    });
    const decoded = await decodeAuraAudio(stream);
    expect(new Uint8Array(decoded)).toEqual(bytesOf([10, 20, 30]));
  });
});

describe("runAuraTts", () => {
  it("calls Aura with speaker and returnRawResponse", async () => {
    const audio = bytesOf([1, 2, 3]).buffer;
    const run = vi.fn().mockResolvedValue(audio);
    const decoded = await runAuraTts({ run }, { text: "Hello", voice: "asteria" });
    expect(run).toHaveBeenCalledWith(
      AURA_MODEL,
      { text: "Hello", speaker: "asteria" },
      { returnRawResponse: true },
    );
    expect(new Uint8Array(decoded)).toEqual(bytesOf([1, 2, 3]));
  });
});
