import type { PodcastTurn } from "./schema";

const FOURTH_WALL_PATTERNS = [
  /\badam\b/i,
  /\byour\s+(?:draft|essay|paper|assignment|thesis)\b/i,
  /\b(?:when|if)\s+you(?:'re| are)?\s+writ(?:e|ing)\b/i,
  /\byou(?:'ll| will)\s+need\s+to\s+(?:write|cite|anchor|argue)\b/i,
];

const CONTINUATION_OPEN = /^(?:and|but|also|so anyway)\b/i;

const CLOSING_CUES = [
  "next time",
  "leave it there",
  "that's the show",
  "enough for today",
  "wrap up",
  "wrap this",
  "until next",
  "sign off",
  "we'll stop",
  "that's where we'll stop",
];

const SPEAKING_KINDS = new Set<PodcastTurn["kind"]>([
  "content",
  "banter",
  "quiz-prompt",
  "model-answer",
  "interrupt",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").trim();
}

export function breaksFourthWall(text: string): boolean {
  return FOURTH_WALL_PATTERNS.some(pattern => pattern.test(text));
}

export function filterFourthWallTurns(turns: PodcastTurn[]): PodcastTurn[] {
  return turns.filter(turn => !breaksFourthWall(turn.text));
}

export function podcastNaturalnessError(
  turns: readonly PodcastTurn[],
  options: { allowEmpty?: boolean } = {},
): string | null {
  if (turns.some(turn => breaksFourthWall(turn.text))) {
    return "Podcast script broke the fourth wall";
  }

  if (options.allowEmpty && turns.length > 0 && turns.every(turn => turn.kind === "empty")) {
    return null;
  }

  const speaking = turns.filter(
    turn => SPEAKING_KINDS.has(turn.kind) && turn.text.trim().length > 0,
  );
  if (!speaking.length) return "Podcast script contains no usable speaking turns";

  if (CONTINUATION_OPEN.test(normalize(speaking[0]!.text))) {
    return "Podcast script is missing a cold opening";
  }

  const closing = normalize(speaking.at(-1)!.text);
  if (!CLOSING_CUES.some(cue => closing.includes(cue))) {
    return "Podcast script is missing a closing beat";
  }

  return null;
}
