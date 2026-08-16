export type CaptureKind = "voice" | "photo" | "pdf";

export function appendCaptureBlock(
  body: string,
  input: { kind: CaptureKind; filename: string; text: string },
) {
  const block = `## Capture — ${input.kind} (${input.filename})\n\n${input.text.trim()}`.trimEnd();
  return body.trim() ? `${body.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

export function titleFromCapture(
  title: string,
  input: { kind: CaptureKind; text: string; now?: Date },
) {
  if (title.trim()) return title;
  const line = input.text
    .split("\n")
    .map(part => part.trim())
    .find(Boolean) ?? "";
  if (line) return line.slice(0, 80);
  const day = (input.now ?? new Date()).toISOString().slice(0, 10);
  const label = input.kind === "voice" ? "Voice note" : input.kind === "photo" ? "Photo note" : "PDF note";
  return `${label} ${day}`;
}
