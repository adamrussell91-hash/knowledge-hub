export type PlayerEvent = "play" | "pause" | "ended" | "interrupt" | "immediate-stop";

export type PlayerState = {
  playing: boolean;
  index: number;
  pendingInterrupt?: string;
};

export type PlayerCommand =
  | { type: "noop" }
  | { type: "play-index"; index: number }
  | { type: "pause" }
  | { type: "stop-now" }
  | { type: "wait-answer" }
  | { type: "submit-interrupt"; question: string };

type Turn = { id: string; kind: string; audioKey?: string };

function withPending(state: PlayerState, pendingInterrupt?: string): PlayerState {
  if (pendingInterrupt) return { ...state, pendingInterrupt };
  const next = { ...state };
  delete next.pendingInterrupt;
  return next;
}

function isSilentMarker(turn: Turn) {
  return (turn.kind === "cue" || turn.kind === "empty") && !turn.audioKey;
}

function nextPlayable(start: number, turns: Turn[]) {
  let index = start;
  while (index < turns.length) {
    const turn = turns[index];
    if (!turn || isSilentMarker(turn)) {
      index += 1;
      continue;
    }
    return index;
  }
  return index;
}

function playAt(state: PlayerState, index: number, turns: Turn[]) {
  const playable = nextPlayable(index, turns);
  if (playable >= turns.length) {
    return { state: withPending({ ...state, playing: false, index: playable }, state.pendingInterrupt), command: { type: "noop" } as const };
  }
  return {
    state: withPending({ ...state, playing: true, index: playable }, state.pendingInterrupt),
    command: { type: "play-index" as const, index: playable },
  };
}

export function failCurrentLine(state: PlayerState): PlayerState {
  return withPending({ ...state, playing: false }, state.pendingInterrupt);
}

export function pauseAfterInterrupt(state: PlayerState): PlayerState {
  return { playing: false, index: state.index + 1 };
}

export function playerBoxLabel(waitingAnswer: boolean) {
  return waitingAnswer ? "Answer" : "Interrupt";
}

export function submitQuiz(input: {
  waitingAnswer: boolean;
  afterTurn: string;
  text: string;
  skip?: boolean;
}):
  | { type: "answer"; afterTurn: string; text: string }
  | { type: "interrupt"; afterTurn: string; question: string }
  | { type: "noop" } {
  if (input.waitingAnswer) {
    return { type: "answer", afterTurn: input.afterTurn, text: input.skip ? "skip" : input.text };
  }
  const question = input.text.trim();
  if (!question) return { type: "noop" };
  return { type: "interrupt", afterTurn: input.afterTurn, question };
}

export function nextAction(
  state: PlayerState,
  event: PlayerEvent,
  turns: Turn[],
  sensitivity: "finish-thought" | "immediate",
  question?: string,
): { state: PlayerState; command: PlayerCommand } {
  if (event === "pause") {
    return { state: withPending({ ...state, playing: false }, state.pendingInterrupt), command: { type: "pause" } };
  }

  if (event === "immediate-stop") {
    return { state: withPending({ ...state, playing: false }, state.pendingInterrupt), command: { type: "stop-now" } };
  }

  if (event === "play") {
    if (state.playing) return { state, command: { type: "noop" } };
    return playAt(state, state.index, turns);
  }

  if (event === "interrupt") {
    const pending = question ?? state.pendingInterrupt;
    if (sensitivity === "immediate") {
      return {
        state: withPending({ ...state, playing: false }, pending),
        command: { type: "stop-now" },
      };
    }
    if (!state.playing && pending) {
      return {
        state: withPending({ ...state, playing: false }),
        command: { type: "submit-interrupt", question: pending },
      };
    }
    return { state: withPending({ ...state }, pending), command: { type: "noop" } };
  }

  const current = turns[state.index];
  if (current?.kind === "quiz-prompt" && !state.pendingInterrupt) {
    return { state: withPending({ ...state, playing: false }, state.pendingInterrupt), command: { type: "wait-answer" } };
  }

  if (state.pendingInterrupt) {
    return {
      state: withPending({ ...state, playing: false }),
      command: { type: "submit-interrupt", question: state.pendingInterrupt },
    };
  }

  return playAt(state, state.index + 1, turns);
}
