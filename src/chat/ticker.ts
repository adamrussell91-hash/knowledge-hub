export type ChatTickPhase = "searching" | "round" | "writing" | "failed";

export type ChatTickInput = {
  phase: ChatTickPhase;
  hatLabel: string;
  scope: string;
  depth: string;
  round?: number;
  maxRounds?: number;
  noteCount?: number;
  followUps?: number;
};

export function chatTick(input: ChatTickInput): string {
  const sitting = `${input.hatLabel} · ${input.scope} · ${input.depth}`;
  if (input.phase === "searching") return `Searching archive — ${sitting}`;
  if (input.phase === "failed") return `Archive pull failed — writing with what she has`;
  if (input.phase === "writing") {
    const notes = input.noteCount ?? 0;
    return notes ? `Writing from ${notes} archive note${notes === 1 ? "" : "s"}` : "Writing the reply";
  }
  const round = input.round ?? 1;
  const max = input.maxRounds ?? round;
  const notes = input.noteCount ?? 0;
  const follow = input.followUps ?? 0;
  return `Round ${round}/${max} — ${notes} notes, ${follow} follow-up${follow === 1 ? "" : "s"}`;
}

export function appendTick(lines: string[], next: string, cap = 8) {
  if (lines[lines.length - 1] === next) return lines;
  return [...lines, next].slice(-cap);
}
