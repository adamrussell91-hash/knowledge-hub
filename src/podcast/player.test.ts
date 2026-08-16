import { describe, expect, it } from "vitest";
import {
  failCurrentLine,
  hasPlayableTurn,
  nextAction,
  pauseAfterInterrupt,
  playerBoxLabel,
  submitQuiz,
  type PlayerState,
} from "./player";

type Turn = { id: string; kind: string; audioKey?: string };

const idle: PlayerState = { playing: false, index: 0 };

const turns = (...items: Turn[]) => items;

describe("nextAction", () => {
  it("ended advances to the next playable turn", () => {
    const script = turns(
      { id: "t1", kind: "content", audioKey: "a1" },
      { id: "t2", kind: "content", audioKey: "a2" },
    );
    const result = nextAction({ playing: true, index: 0 }, "ended", script, "finish-thought");
    expect(result.state).toEqual({ playing: true, index: 1 });
    expect(result.command).toEqual({ type: "play-index", index: 1 });
  });

  it("skips cue turns that have no audioKey", () => {
    const script = turns(
      { id: "t1", kind: "content", audioKey: "a1" },
      { id: "beat", kind: "cue" },
      { id: "t2", kind: "content", audioKey: "a2" },
    );
    const fromEnded = nextAction({ playing: true, index: 0 }, "ended", script, "finish-thought");
    expect(fromEnded.state.index).toBe(2);
    expect(fromEnded.command).toEqual({ type: "play-index", index: 2 });

    const fromPlay = nextAction({ ...idle, index: 1 }, "play", script, "finish-thought");
    expect(fromPlay.state).toEqual({ playing: true, index: 2 });
    expect(fromPlay.command).toEqual({ type: "play-index", index: 2 });
  });

  it("does not skip a spoken turn that is still waiting for audio", () => {
    const script = turns(
      { id: "t1", kind: "content", audioKey: "a1" },
      { id: "answer", kind: "content" },
      { id: "t3", kind: "content", audioKey: "a3" },
    );
    const result = nextAction({ playing: true, index: 0 }, "ended", script, "finish-thought");
    expect(result.state.index).toBe(1);
    expect(result.command).toEqual({ type: "play-index", index: 1 });
  });

  it("does not skip a spoken turn that is still waiting for audio", () => {
    const script = turns(
      { id: "t1", kind: "content", audioKey: "a1" },
      { id: "answer", kind: "content" },
      { id: "t3", kind: "content", audioKey: "a3" },
    );
    const result = nextAction({ playing: true, index: 0 }, "ended", script, "finish-thought");
    expect(result.state.index).toBe(1);
    expect(result.command).toEqual({ type: "play-index", index: 1 });
  });

  it("interrupt finish-thought waits for ended before submit-interrupt", () => {
    const script = turns(
      { id: "t1", kind: "content", audioKey: "a1" },
      { id: "t2", kind: "content", audioKey: "a2" },
    );
    const interrupted = nextAction(
      { playing: true, index: 0 },
      "interrupt",
      script,
      "finish-thought",
      "why autonomy?",
    );
    expect(interrupted.state.playing).toBe(true);
    expect(interrupted.state.index).toBe(0);
    expect(interrupted.state.pendingInterrupt).toBe("why autonomy?");
    expect(interrupted.command).toEqual({ type: "noop" });

    const after = nextAction(interrupted.state, "ended", script, "finish-thought");
    expect(after.command).toEqual({ type: "submit-interrupt", question: "why autonomy?" });
    expect(after.state.playing).toBe(false);
    expect(after.state.pendingInterrupt).toBeUndefined();
    expect(after.state.index).toBe(0);
  });

  it("interrupt finish-thought submits immediately when nothing is playing", () => {
    const script = turns({ id: "t1", kind: "content", audioKey: "a1" });
    const result = nextAction(idle, "interrupt", script, "finish-thought", "why autonomy?");
    expect(result.command).toEqual({ type: "submit-interrupt", question: "why autonomy?" });
    expect(result.state.pendingInterrupt).toBeUndefined();
  });

  it("interrupt immediate returns stop-now and keeps the question pending", () => {
    const script = turns({ id: "t1", kind: "content", audioKey: "a1" });
    const result = nextAction(
      { playing: true, index: 0 },
      "interrupt",
      script,
      "immediate",
      "why autonomy?",
    );
    expect(result.command).toEqual({ type: "stop-now" });
    expect(result.state.playing).toBe(false);
    expect(result.state.pendingInterrupt).toBe("why autonomy?");
  });

  it("play on a silent-only episode reports nothing to play and holds the index", () => {
    const script = turns({ id: "t1", kind: "empty" });
    const result = nextAction(idle, "play", script, "finish-thought");
    expect(result.command).toEqual({ type: "nothing-to-play" });
    expect(result.state).toEqual({ playing: false, index: 0 });
    expect(hasPlayableTurn(script)).toBe(false);
  });

  it("quiz-prompt ended returns wait-answer and does not auto-advance", () => {
    const script = turns(
      { id: "q1", kind: "quiz-prompt", audioKey: "aq" },
      { id: "t2", kind: "content", audioKey: "a2" },
    );
    const result = nextAction({ playing: true, index: 0 }, "ended", script, "finish-thought");
    expect(result.command).toEqual({ type: "wait-answer" });
    expect(result.state.playing).toBe(false);
    expect(result.state.index).toBe(0);
  });
});

describe("submitQuiz", () => {
  it("posts an answer while waiting for a quiz reply", () => {
    expect(submitQuiz({ waitingAnswer: true, afterTurn: "q1", text: "Autonomy" })).toEqual({
      type: "answer",
      afterTurn: "q1",
      text: "Autonomy",
    });
  });

  it("posts skip as the answer text when the listener skips", () => {
    expect(submitQuiz({ waitingAnswer: true, afterTurn: "q1", text: "", skip: true })).toEqual({
      type: "answer",
      afterTurn: "q1",
      text: "skip",
    });
  });

  it("keeps interrupt submit when not waiting for an answer", () => {
    expect(submitQuiz({ waitingAnswer: false, afterTurn: "t1", text: "why autonomy?" })).toEqual({
      type: "interrupt",
      afterTurn: "t1",
      question: "why autonomy?",
    });
  });
});

describe("playerBoxLabel", () => {
  it("labels the box Answer while waiting for a quiz reply", () => {
    expect(playerBoxLabel(true)).toBe("Answer");
    expect(playerBoxLabel(false)).toBe("Interrupt");
  });
});

describe("submitQuiz", () => {
  it("posts an answer while waiting for a quiz reply", () => {
    expect(submitQuiz({ waitingAnswer: true, afterTurn: "q1", text: "Autonomy" })).toEqual({
      type: "answer",
      afterTurn: "q1",
      text: "Autonomy",
    });
  });

  it("posts skip as the answer text when the listener skips", () => {
    expect(submitQuiz({ waitingAnswer: true, afterTurn: "q1", text: "", skip: true })).toEqual({
      type: "answer",
      afterTurn: "q1",
      text: "skip",
    });
  });

  it("keeps interrupt submit when not waiting for an answer", () => {
    expect(submitQuiz({ waitingAnswer: false, afterTurn: "t1", text: "why autonomy?" })).toEqual({
      type: "interrupt",
      afterTurn: "t1",
      question: "why autonomy?",
    });
  });
});

describe("playerBoxLabel", () => {
  it("labels the box Answer while waiting for a quiz reply", () => {
    expect(playerBoxLabel(true)).toBe("Answer");
    expect(playerBoxLabel(false)).toBe("Interrupt");
  });
});

describe("play failure helpers", () => {
  it("failCurrentLine stays on the index and stops playing", () => {
    const next = failCurrentLine({ playing: true, index: 2, pendingInterrupt: "hold" });
    expect(next.playing).toBe(false);
    expect(next.index).toBe(2);
    expect(next.pendingInterrupt).toBe("hold");
  });

  it("pauseAfterInterrupt lands on the next turn without playing", () => {
    expect(pauseAfterInterrupt({ playing: false, index: 0 })).toEqual({ playing: false, index: 1 });
  });
});
