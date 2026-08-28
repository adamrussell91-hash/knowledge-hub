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
  webResearch?: boolean;
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

export const BOOK_NOTE_WAIT_LINES = [
  "Looking it up on the open web…",
  "Chasing the named source…",
  "Reading past the blog fog…",
  "Checking how the term is used…",
  "Pulling the definition into focus…",
  "Turning the page back to the book…",
];

export function pickClementineWaitLine(
  {
    exclude,
    pool = CLEMENTINE_WAIT_LINES,
    random = Math.random,
  }: { exclude?: string; pool?: readonly string[]; random?: () => number } = {},
): string {
  const filtered = exclude ? pool.filter(line => line !== exclude) : [...pool];
  const choices = filtered.length ? filtered : [...pool];
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)));
  return choices[index]!;
}

export function chatTick(input: ChatTickInput): string {
  const sitting = `${input.hatLabel} · ${input.scope} · ${input.depth}`;
  const wait = input.waitLine ?? (input.webResearch ? BOOK_NOTE_WAIT_LINES[0]! : CLEMENTINE_WAIT_LINES[0]!);
  if (input.phase === "searching") return `${wait} — ${sitting}`;
  if (input.phase === "library") {
    const notes = input.noteCount ?? 0;
    return notes
      ? `${wait} — ${notes} searched note${notes === 1 ? "" : "s"} from this sitting`
      : `${wait} — using the sitting library`;
  }
  if (input.phase === "failed") {
    return input.webResearch
      ? `${wait} — web search failed; drafting with what she has`
      : `${wait} — archive pull failed; using what she has`;
  }
  if (input.phase === "writing") {
    if (input.webResearch) return `${wait} — drafting the note from the open web`;
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
