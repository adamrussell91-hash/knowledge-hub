import { describe, expect, it } from "vitest";
import type { PodcastTurn } from "./schema";
import {
  breaksFourthWall,
  filterFourthWallTurns,
  podcastNaturalnessError,
} from "./naturalness";

const turn = (id: string, text: string, kind: PodcastTurn["kind"] = "content"): PodcastTurn => ({
  id,
  speaker: "clementine",
  kind,
  text,
  citations: kind === "empty" ? [] : [{ pageId: "p1", title: "SDT" }],
});

describe("podcast naturalness gate", () => {
  it.each([
    "Adam, this is the point.",
    "Your essay needs a stronger warrant.",
    "If you're writing across both clusters, cite this.",
    "When you write the paper, anchor the claim.",
    "If you’re writing across both clusters, cite this.",
    "You’ll need to cite the note.",
  ])("detects a fourth-wall leak: %s", text => {
    expect(breaksFourthWall(text)).toBe(true);
  });

  it("accepts a framed episode", () => {
    expect(podcastNaturalnessError([
      turn("open", "Today we're looking at why autonomy gets mistaken for independence."),
      turn("close", "That's where we'll stop for today."),
    ])).toBeNull();
  });

  it("rejects a mid-argument opening", () => {
    expect(podcastNaturalnessError([
      turn("open", "And the second study makes the same point."),
      turn("close", "We'll leave it there."),
    ])).toMatch(/opening/i);
  });

  it("rejects a missing closing beat", () => {
    expect(podcastNaturalnessError([
      turn("open", "Today we're looking at autonomy."),
      turn("last", "The second note complicates that claim."),
    ])).toMatch(/closing/i);
  });

  it("allows the empty Recap state when requested", () => {
    expect(podcastNaturalnessError(
      [turn("empty", "Nothing new in the archive this period.", "empty")],
      { allowEmpty: true },
    )).toBeNull();
  });

  it("removes only fourth-wall turns from a follow-up", () => {
    const safe = turn("safe", "The note supports autonomy.");
    expect(filterFourthWallTurns([
      turn("bad", "Adam, your paper needs this."),
      safe,
    ])).toEqual([safe]);
  });
});
