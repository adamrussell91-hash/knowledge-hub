import { appendCaptureBlock, titleFromCapture, type CaptureKind } from "./appendBlock";

export { appendCaptureBlock, titleFromCapture };
export type { CaptureKind };

export const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;

export function recorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

export function captureFileName(kind: CaptureKind, file: File, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  if (kind === "voice") return `voice-${stamp}${file.type.includes("mp4") ? ".m4a" : ".webm"}`;
  if (file.name && file.name.includes(".")) return file.name;
  if (kind === "pdf") return `capture-${stamp}.pdf`;
  return `photo-${stamp}.jpg`;
}

export function captureContentType(kind: CaptureKind, file: File) {
  if (file.type) return file.type;
  if (kind === "pdf") return "application/pdf";
  if (kind === "photo") return "image/jpeg";
  return "audio/webm";
}

export type CaptureUiState = {
  busy: boolean;
  captureBusy: boolean;
  recording: boolean;
  localData: boolean;
};

export function captureControlState(state: CaptureUiState) {
  const captureDisabled = state.localData || state.busy || state.captureBusy ? "disabled" : "";
  const captureOthersDisabled = captureDisabled || state.recording ? "disabled" : "";
  const voiceLabel = state.recording ? "Stop" : state.captureBusy ? "Capturing…" : "Voice";
  return { captureDisabled, captureOthersDisabled, voiceLabel };
}

export function captureFieldHtml(state: CaptureUiState) {
  const { captureDisabled, captureOthersDisabled, voiceLabel } = captureControlState(state);
  return `<div class="compose__field">
        <label>Capture</label>
        <div class="compose__capture">
          <button class="btn" data-capture-voice type="button" ${captureDisabled}>${voiceLabel}</button>
          <button class="btn" data-capture-photo type="button" ${captureOthersDisabled}>Photo</button>
          <button class="btn" data-capture-pdf type="button" ${captureOthersDisabled}>PDF</button>
        </div>
        <input id="compose-photo" class="compose__hidden-file" type="file" accept="image/*" capture="environment" />
        <input id="compose-pdf" class="compose__hidden-file" type="file" accept="application/pdf" />
      </div>`;
}

export type SignedCapture = {
  put_url: string;
  attachment: { filename: string; r2_key: string };
};

export type CaptureIngestInput = {
  file: File;
  kind: CaptureKind;
  pageId: string;
  area: "notes" | "university";
  body: string;
  title: string;
};

export type CaptureIngestDeps = {
  signAttachment: (input: {
    filename: string;
    content_type: string;
    byte_size: number;
    page_id: string;
    area: "notes" | "university";
  }) => Promise<SignedCapture>;
  uploadSignedFile: (putUrl: string, file: File, contentType: string) => Promise<void>;
  runCapture: (r2Key: string) => Promise<{ text: string }>;
  localData?: boolean;
  maxBytes?: number;
};

export type CaptureIngestResult =
  | { ok: true; body: string; title: string; attachment: SignedCapture["attachment"]; toast: string }
  | { ok: false; toast: string; attachment?: SignedCapture["attachment"] };

export async function ingestCaptureFile(
  input: CaptureIngestInput,
  deps: CaptureIngestDeps,
): Promise<CaptureIngestResult> {
  const maxBytes = deps.maxBytes ?? MAX_CAPTURE_BYTES;
  if (input.file.size > maxBytes) {
    return { ok: false, toast: `${input.file.name} exceeds 20MB and was skipped` };
  }
  if (deps.localData) {
    return { ok: false, toast: "Capture needs the live API (npx netlify dev)." };
  }
  let attachment: SignedCapture["attachment"] | undefined;
  try {
    const contentType = captureContentType(input.kind, input.file);
    const filename = captureFileName(input.kind, input.file);
    const named = new File([input.file], filename, { type: contentType });
    const signed = await deps.signAttachment({
      filename,
      content_type: contentType,
      byte_size: named.size,
      page_id: input.pageId,
      area: input.area,
    });
    attachment = signed.attachment;
    await deps.uploadSignedFile(signed.put_url, named, contentType);
    const captured = await deps.runCapture(signed.attachment.r2_key);
    return {
      ok: true,
      body: appendCaptureBlock(input.body, {
        kind: input.kind,
        filename: signed.attachment.filename,
        text: captured.text,
      }),
      title: titleFromCapture(input.title, { kind: input.kind, text: captured.text }),
      attachment: signed.attachment,
      toast: captured.text.trim() ? "Captured" : "Nothing readable",
    };
  } catch (error) {
    return {
      ok: false,
      toast: error instanceof Error ? error.message : "Capture failed",
      attachment,
    };
  }
}

export function bindCaptureControls(
  root: ParentNode,
  opts: {
    syncFields: () => void;
    onVoice: () => void;
    onPhoto: (file: File) => void;
    onPdf: (file: File) => void;
  },
) {
  root.querySelector<HTMLButtonElement>("[data-capture-voice]")!.onclick = () => {
    opts.syncFields();
    opts.onVoice();
  };
  root.querySelector<HTMLButtonElement>("[data-capture-photo]")!.onclick = () => {
    root.querySelector<HTMLInputElement>("#compose-photo")?.click();
  };
  root.querySelector<HTMLButtonElement>("[data-capture-pdf]")!.onclick = () => {
    root.querySelector<HTMLInputElement>("#compose-pdf")?.click();
  };
  root.querySelector<HTMLInputElement>("#compose-photo")!.onchange = event => {
    opts.syncFields();
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) opts.onPhoto(file);
  };
  root.querySelector<HTMLInputElement>("#compose-pdf")!.onchange = event => {
    opts.syncFields();
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) opts.onPdf(file);
  };
}

export type VoiceCaptureHandle = {
  toggle: () => Promise<"started" | "stopping" | "denied">;
  stopMic: () => void;
};

export function createVoiceCapture(opts: { onFile: (file: File) => void }): VoiceCaptureHandle {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;

  const stopMic = () => {
    recorder = null;
    chunks = [];
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };

  return {
    stopMic,
    async toggle() {
      if (recorder) {
        recorder.stop();
        return "stopping";
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        const mime = recorderMime();
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.ondataavailable = event => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          const type = recorder?.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          stopMic();
          opts.onFile(new File([blob], "", { type }));
        };
        recorder.start();
        return "started";
      } catch {
        stopMic();
        return "denied";
      }
    },
  };
}
