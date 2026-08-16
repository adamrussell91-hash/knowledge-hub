import { describe, expect, it, vi } from "vitest";
import { markEpisodeRecording, speakPendingTurns, speakTurns, VOICE_BY_SPEAKER } from "./speak";
import { PodcastEpisodeSchema, type PodcastTurn } from "./schema";

const turn = (overrides: Partial<PodcastTurn>): PodcastTurn => ({
  id: "t1",
  speaker: "clementine",
  kind: "content",
  text: "Deci named three needs.",
  citations: [],
  ...overrides,
});

const fakeBytes = () => new ArrayBuffer(8);

describe("speakTurns", () => {
  it("calls tts with athena for clementine and sets audioKey", async () => {
    const tts = vi.fn().mockResolvedValue(fakeBytes());
    const put = vi.fn().mockResolvedValue(undefined);

    const result = await speakTurns([turn({ id: "c1" })], "ep-1", { tts, put });

    expect(tts).toHaveBeenCalledWith({ text: "Deci named three needs.", voice: "athena" });
    expect(put).toHaveBeenCalledWith("podcast/audio/ep-1/c1", expect.any(ArrayBuffer));
    expect(result[0]?.audioKey).toBe("podcast/audio/ep-1/c1");
  });

  it("calls tts with luna for ann", async () => {
    const tts = vi.fn().mockResolvedValue(fakeBytes());
    const put = vi.fn().mockResolvedValue(undefined);

    await speakTurns([turn({ id: "a1", speaker: "ann" })], "ep-1", { tts, put });

    expect(tts).toHaveBeenCalledWith({ text: "Deci named three needs.", voice: "luna" });
  });

  it("skips tts for cue and empty turns", async () => {
    const tts = vi.fn().mockResolvedValue(fakeBytes());
    const put = vi.fn().mockResolvedValue(undefined);

    const result = await speakTurns(
      [
        turn({ id: "cue-1", kind: "cue", speaker: undefined, text: "[intro]" }),
        turn({ id: "empty-1", kind: "empty", text: "Nothing new." }),
      ],
      "ep-1",
      { tts, put },
    );

    expect(tts).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(result[0]?.audioKey).toBeUndefined();
    expect(result[1]?.audioKey).toBeUndefined();
  });

  it("keeps turn without audioKey when tts fails twice", async () => {
    const tts = vi.fn().mockRejectedValue(new Error("tts down"));
    const put = vi.fn();

    const input = [turn({ id: "fail-1" })];
    const result = await speakTurns(input, "ep-1", { tts, put });

    expect(tts).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalled();
    expect(result[0]).toEqual(input[0]);
    expect(result[0]?.audioKey).toBeUndefined();
  });

  it("sets audioKey when tts fails once then succeeds", async () => {
    const tts = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(fakeBytes());
    const put = vi.fn().mockResolvedValue(undefined);

    const result = await speakTurns([turn({ id: "retry-1" })], "ep-1", { tts, put });

    expect(tts).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledWith("podcast/audio/ep-1/retry-1", expect.any(ArrayBuffer));
    expect(result[0]?.audioKey).toBe("podcast/audio/ep-1/retry-1");
  });
});

describe("VOICE_BY_SPEAKER", () => {
  it("maps hosts to Aura voices", () => {
    expect(VOICE_BY_SPEAKER).toEqual({ clementine: "athena", ann: "luna" });
  });
});

describe("speakPendingTurns", () => {
  const episode = PodcastEpisodeSchema.parse({
    id: "ep-1",
    created_at: "2026-08-15T00:00:00.000Z",
    status: "ready",
    mode: "quiz",
    modeDial: {},
    dials: {},
    sourcePageIds: ["p1"],
    turns: [
      turn({ id: "old", audioKey: "podcast/audio/ep-1/old" }),
      turn({ id: "new", text: "Autonomy is one need." }),
    ],
    memory: "",
  });

  it("speaks turns that still lack audioKey", async () => {
    const tts = vi.fn().mockResolvedValue(fakeBytes());
    const put = vi.fn().mockResolvedValue(undefined);
    const spoken = await speakPendingTurns(episode, { tts, put });
    expect(tts).toHaveBeenCalledTimes(1);
    expect(tts).toHaveBeenCalledWith({ text: "Autonomy is one need.", voice: "athena" });
    expect(spoken.turns[1]?.audioKey).toBe("podcast/audio/ep-1/new");
    expect(spoken.turns[0]?.audioKey).toBe("podcast/audio/ep-1/old");
  });

  it("returns text turns unchanged when TTS is missing", async () => {
    const put = vi.fn();
    const spoken = await speakPendingTurns(episode, { put });
    expect(put).not.toHaveBeenCalled();
    expect(spoken.turns[1]?.audioKey).toBeUndefined();
  });

  it("sets running when spoken turns still lack audio", () => {
    const marked = markEpisodeRecording(episode);
    expect(marked.status).toBe("running");
    expect(marked.turns[1]?.audioKey).toBeUndefined();
  });
});

describe("speakPendingTurns", () => {
  const episode = PodcastEpisodeSchema.parse({
    id: "ep-1",
    created_at: "2026-08-15T00:00:00.000Z",
    status: "ready",
    mode: "quiz",
    modeDial: {},
    dials: {},
    sourcePageIds: ["p1"],
    turns: [
      turn({ id: "old", audioKey: "podcast/audio/ep-1/old" }),
      turn({ id: "new", text: "Autonomy is one need." }),
    ],
    memory: "",
  });

  it("speaks turns that still lack audioKey", async () => {
    const tts = vi.fn().mockResolvedValue(fakeBytes());
    const put = vi.fn().mockResolvedValue(undefined);
    const spoken = await speakPendingTurns(episode, { tts, put });
    expect(tts).toHaveBeenCalledTimes(1);
    expect(tts).toHaveBeenCalledWith({ text: "Autonomy is one need.", voice: "athena" });
    expect(spoken.turns[1]?.audioKey).toBe("podcast/audio/ep-1/new");
    expect(spoken.turns[0]?.audioKey).toBe("podcast/audio/ep-1/old");
  });

  it("returns text turns unchanged when TTS is missing", async () => {
    const put = vi.fn();
    const spoken = await speakPendingTurns(episode, { put });
    expect(put).not.toHaveBeenCalled();
    expect(spoken.turns[1]?.audioKey).toBeUndefined();
  });

  it("sets running when spoken turns still lack audio", () => {
    const marked = markEpisodeRecording(episode);
    expect(marked.status).toBe("running");
    expect(marked.turns[1]?.audioKey).toBeUndefined();
  });
});
