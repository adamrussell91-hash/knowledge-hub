export type ClementineLayers = {
  voice: string;
  job: string;
  surface: string;
  payload: string;
};

export function assembleClementinePrompt(layers: ClementineLayers): string {
  if (!layers.voice.trim()) {
    throw new Error("Prompt file missing: clementine-voice.md");
  }
  if (!layers.job.trim()) {
    throw new Error("Prompt file missing: job");
  }
  return [layers.voice, layers.job, layers.surface, layers.payload]
    .map(part => part.trim())
    .filter(Boolean)
    .join("\n\n");
}
