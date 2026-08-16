export const AURA_MODEL = "@cf/deepgram/aura-1";

export type AuraAi = {
  run: (
    model: string,
    input: unknown,
    options?: { returnRawResponse?: boolean },
  ) => Promise<unknown>;
};

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function viewToArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  return new Response(stream).arrayBuffer();
}

export async function decodeAuraAudio(result: unknown): Promise<ArrayBuffer> {
  if (result instanceof Response) {
    return result.body ? streamToArrayBuffer(result.body) : result.arrayBuffer();
  }
  if (typeof ReadableStream !== "undefined" && result instanceof ReadableStream) {
    return streamToArrayBuffer(result as ReadableStream<Uint8Array>);
  }
  if (result instanceof ArrayBuffer) return result;
  if (ArrayBuffer.isView(result)) return viewToArrayBuffer(result);
  if (typeof result === "string") return base64ToArrayBuffer(result);
  if (result && typeof result === "object") {
    const audio = "audio" in result ? (result as { audio: unknown }).audio : undefined;
    return decodeAuraAudio(audio);
  }
  throw new Error("Unexpected TTS result");
}

export async function runAuraTts(
  ai: AuraAi,
  input: { text: string; voice: string },
): Promise<ArrayBuffer> {
  return decodeAuraAudio(
    await ai.run(AURA_MODEL, { text: input.text, speaker: input.voice }, { returnRawResponse: true }),
  );
}
