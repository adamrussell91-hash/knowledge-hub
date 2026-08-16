import { describe, expect, it } from "vitest";
import { dumpPageId, dumpSessionToQuiz, gapsToQuizItems, scoreBlueGaps, sortThenDumpPeek, type DumpNode } from "./dumpSort";

const nodes: DumpNode[] = [
  { id: "c", x: 0, y: 0, text: "Retrieval", type: "center" },
  { id: "1", x: 10, y: 10, text: "Testing effect", type: "black" },
  { id: "2", x: 20, y: 20, text: "Desirable difficulty", type: "blue" },
  { id: "3", x: 30, y: 30, text: "Gap", type: "blue" },
  { id: "4", x: 40, y: 40, text: "   ", type: "blue" },
];

describe("gapsToQuizItems", () => {
  it("turns real blue gaps into untested quiz items and skips the rest", () => {
    const items = gapsToQuizItems({
      topic: "Retrieval",
      nodes,
      area: "notes",
      tags: ["memory"],
      now: new Date("2024-02-01T00:00:00.000Z"),
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "gap",
      cue: "What is missing: Desirable difficulty?",
      answer: "Gap from Dump and Sort on Retrieval.",
      area: "notes",
      tags: ["memory"],
      status: "untested",
      page_id: dumpPageId("Retrieval"),
    });
  });

  it("keeps ids stable for the same topic and gap text", () => {
    const a = gapsToQuizItems({ topic: "Retrieval", nodes, area: "notes", tags: [] });
    const b = gapsToQuizItems({ topic: "Retrieval", nodes, area: "notes", tags: [] });
    expect(a[0].id).toBe(b[0].id);
  });
});

describe("dumpSessionToQuiz", () => {
  it("saves known nodes and maps dump edges onto item ids", () => {
    const result = dumpSessionToQuiz({
      topic: "Retrieval",
      nodes,
      edges: [{ from: "1", to: "2" }],
      area: "notes",
      tags: ["memory"],
    });
    expect(result.items.map(item => item.kind).sort()).toEqual(["gap", "known"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe(result.items.find(item => item.kind === "known")!.id);
    expect(result.edges[0].to).toBe(result.items.find(item => item.kind === "gap")!.id);
  });
});

describe("sortThenDumpPeek", () => {
  it("prefers a saved dump snapshot for the topic", () => {
    const snapshot = dumpSessionToQuiz({
      topic: "Retrieval",
      nodes,
      edges: [],
      area: "notes",
      tags: [],
    }).snapshot;
    const peek = sortThenDumpPeek("Retrieval", [snapshot], [
      { cue: "What does this note claim about: Testing effect?", kind: "heading" },
    ]);
    expect(peek.some(node => node.text === "Testing effect" && node.type === "black")).toBe(true);
  });

  it("falls back to harvested heading claims", () => {
    const peek = sortThenDumpPeek("New topic", [], [
      { cue: "What does this note claim about: Testing effect?", kind: "heading" },
    ]);
    expect(peek).toEqual([
      expect.objectContaining({ text: "Testing effect", type: "black" }),
    ]);
  });
});

describe("scoreBlueGaps", () => {
  it("ranks gap clusters before isolated gaps", () => {
    const ranked = scoreBlueGaps(
      [
        { id: "c", x: 0, y: 0, text: "Topic", type: "center" },
        { id: "k", x: 1, y: 1, text: "Known", type: "black" },
        { id: "g1", x: 2, y: 2, text: "Cluster a", type: "blue" },
        { id: "g2", x: 3, y: 3, text: "Cluster b", type: "blue" },
        { id: "g3", x: 4, y: 4, text: "Alone", type: "blue" },
      ],
      [
        { from: "g1", to: "g2" },
        { from: "k", to: "g1" },
      ],
    );
    expect(ranked.map(item => item.text)).toEqual(["Cluster b", "Cluster a", "Alone"]);
  });
});
