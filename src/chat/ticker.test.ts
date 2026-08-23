import { describe, expect, it } from "vitest";
import { appendTick, chatTick } from "./ticker";

describe("chatTick", () => {
  it("names the sitting when search starts", () => {
    expect(
      chatTick({ phase: "searching", hatLabel: "Scoping", scope: "wide", depth: "single" }),
    ).toBe("Checking the archive shelves… — Scoping · wide · single");
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
    ).toBe("Checking the archive shelves… — round 2/5, 6 notes, 1 follow-up");
  });

  it("only calls a pull failed when the archive request itself failed", () => {
    expect(
      chatTick({ phase: "failed", hatLabel: "Scoping", scope: "wide", depth: "single" }),
    ).toBe("Checking the archive shelves… — archive pull failed; using what she has");
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
    ).toBe("Checking the archive shelves… — round 1/1, 0 notes, 0 follow-ups");
  });

  it("says when a follow-up uses the sitting library", () => {
    expect(
      chatTick({
        phase: "library",
        hatLabel: "Scoping",
        scope: "wide",
        depth: "single",
        noteCount: 32,
      }),
    ).toBe("Checking the archive shelves… — 32 searched notes from this sitting");
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
    ).toBe("Checking the archive shelves… — 3 archive notes in play");
  });
});

describe("appendTick", () => {
  it("keeps the last eight lines and skips a line that already appeared", () => {
    const first = appendTick(["a"], "b");
    expect(appendTick(first, "b")).toEqual(["a", "b"]);
    expect(appendTick(["Round 1/1 — 32 notes, 0 follow-ups", "Writing from 32 archive notes"], "Round 1/1 — 32 notes, 0 follow-ups")).toEqual([
      "Round 1/1 — 32 notes, 0 follow-ups",
      "Writing from 32 archive notes",
    ]);
    const many = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(appendTick(many, "9")).toEqual(["2", "3", "4", "5", "6", "7", "8", "9"]);
  });
});
