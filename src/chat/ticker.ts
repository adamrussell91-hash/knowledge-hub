export type ChatTickPhase = "searching" | "library" | "round" | "writing" | "failed";

export type ChatTickInput = {
  phase: ChatTickPhase;
  hatLabel: string;
  scope: string;
  depth: string;
  round?: number;
  maxRounds?: number;
  noteCount?: number;
  followUps?: number;
  waitLine?: string;
};

export const CLEMENTINE_WAIT_LINES = [
  "Checking the archive shelves…",
  "Finding the argument underneath…",
  "Following the strongest citation…",
  "Testing the archive’s memory…",
  "Reading past the competent summary…",
  "Looking for the difficult evidence…",
  "Separating signal from scholarly fog…",
  "Locating the useful contradiction…",
  "Putting the warrant under pressure…",
  "Rescuing the sentence with a spine…",
  "Checking whether the notes agree…",
  "Arranging the evidence properly…",
];

export function pickClementineWaitLine(
  { exclude, random = Math.random }: { exclude?: string; random?: () => number } = {},
): string {
  const pool = exclude ? CLEMENTINE_WAIT_LINES.filter(line => line !== exclude) : CLEMENTINE_WAIT_LINES;
  const choices = pool.length ? pool : CLEMENTINE_WAIT_LINES;
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index]!;
}

export function chatTick(input: ChatTickInput): string {
  const sitting = `${input.hatLabel} · ${input.scope} · ${input.depth}`;
  const wait = input.waitLine ?? CLEMENTINE_WAIT_LINES[0]!;
  if (input.phase === "searching") return `${wait} — ${sitting}`;
  if (input.phase === "library") {
    const notes = input.noteCount ?? 0;
    return notes
      ? `${wait} — ${notes} searched note${notes === 1 ? "" : "s"} from this sitting`
      : `${wait} — using the sitting library`;
  }
  if (input.phase === "failed") return `${wait} — archive pull failed; using what she has`;
  if (input.phase === "writing") {
    const notes = input.noteCount ?? 0;
    return notes
      ? `${wait} — ${notes} archive note${notes === 1 ? "" : "s"} in play`
      : `${wait} — drafting from the sitting`;
  }
  const round = input.round ?? 1;
  const max = input.maxRounds ?? round;
  const notes = input.noteCount ?? 0;
  const follow = input.followUps ?? 0;
  return `${wait} — round ${round}/${max}, ${notes} notes, ${follow} follow-up${follow === 1 ? "" : "s"}`;
}

export function appendTick(lines: string[], next: string, cap = 8) {
  if (lines.includes(next)) return lines;
  return [...lines, next].slice(-cap);
}
