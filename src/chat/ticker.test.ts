import { describe, expect, it } from "vitest";
import { appendTick, chatTick } from "./ticker";

describe("chatTick", () => {
  it("names the sitting when search starts", () => {
    expect(
      chatTick({ phase: "searching", hatLabel: "Scoping", scope: "wide", depth: "single" }),
    ).toBe("Searching archive — Scoping · wide · single");
  });

  it("reports live deep-round progress", () => {
    expect(
      chatTick({
        phase: "round",
        hatLabel: "Thematic synthesis",
        scope: "standard",
        depth: "iterative",
        round: 2,
        maxRounds: 5,
        noteCount: 6,
        followUps: 1,
      }),
    ).toBe("Round 2/5 — 6 notes, 1 follow-up");
  });

  it("only calls a pull failed when the archive request itself failed", () => {
    expect(
      chatTick({ phase: "failed", hatLabel: "Scoping", scope: "wide", depth: "single" }),
    ).toBe("Archive pull failed — writing with what she has");
    expect(
      chatTick({
        phase: "round",
        hatLabel: "Scoping",
        scope: "wide",
        depth: "single",
        round: 1,
        maxRounds: 1,
        noteCount: 0,
      }),
    ).toBe("Round 1/1 — 0 notes, 0 follow-ups");
  });

  it("says when she starts writing from the notes she has", () => {
    expect(
      chatTick({
        phase: "writing",
        hatLabel: "Scoping",
        scope: "wide",
        depth: "single",
        noteCount: 3,
      }),
    ).toBe("Writing from 3 archive notes");
  });
});

describe("appendTick", () => {
  it("keeps the last eight lines and skips duplicates", () => {
    const first = appendTick(["a"], "b");
    expect(appendTick(first, "b")).toEqual(["a", "b"]);
    const many = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(appendTick(many, "9")).toEqual(["2", "3", "4", "5", "6", "7", "8", "9"]);
  });
});
