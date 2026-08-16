import { describe, expect, it } from "vitest";
import { groundTurns } from "./ground";
import type { PodcastTurn } from "./schema";

const turn = (overrides: Partial<PodcastTurn>): PodcastTurn => ({
  id: "t1",
  speaker: "clementine",
  kind: "content",
  text: "Deci named three needs.",
  citations: [{ pageId: "p1", title: "SDT" }],
  ...overrides,
});

const sources = [{ pageId: "p1", title: "SDT" }];

describe("groundTurns", () => {
  it("keeps content cited from the source set", () => {
    const { kept, dropped } = groundTurns([turn({})], sources);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops content that cites a page outside the source set", () => {
    const { kept, dropped } = groundTurns([turn({ citations: [{ pageId: "x", title: "Web" }] })], sources);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual(["t1"]);
  });

  it("keeps content with possessives in the text", () => {
    const { kept, dropped } = groundTurns(
      [turn({ text: "Deci's needs meet Ryan's model.", citations: [{ pageId: "p1", title: "SDT" }] })],
      sources,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops banter that names a title not in the source set", () => {
    const { kept } = groundTurns(
      [turn({ kind: "banter", text: "As we said in 'Quantum Cheese' last week.", citations: [] })],
      sources,
    );
    expect(kept).toHaveLength(0);
  });

  it("allows empty turns without citations", () => {
    const { kept } = groundTurns(
      [turn({ kind: "empty", text: "Nothing new this week.", citations: [] })],
      [],
    );
    expect(kept).toHaveLength(1);
  });
});
