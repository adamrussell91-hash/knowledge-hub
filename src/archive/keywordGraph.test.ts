import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import {
  KEYWORD_PALETTE,
  buildArchiveGraph,
  colorForTopic,
  isTopicKeyword,
  topicKeywords,
} from "./keywordGraph";

const V = TOPIC_VOCABULARY;

describe("topicKeywords", () => {
  it("keeps only closed-list topic tags and folds case onto the vocabulary", () => {
    expect(topicKeywords(["Note", "EDST5805", "learning science and cognition", "Clip"])).toEqual([
      "Learning Science and Cognition",
    ]);
    expect(isTopicKeyword("Educational Psychology")).toBe(true);
    expect(isTopicKeyword("EDST5805")).toBe(false);
    expect(topicKeywords(["Educational Psychology", "Note"])).toEqual([]);
  });
});

describe("archive graph", () => {
  it("promotes every closed topic that appears to a major hub, with stable vocabulary colours", () => {
    const pages = Array.from({ length: 200 }, (_, index) => {
      const a = V[index % 12]!;
      const b = V[(index + 1) % 12]!;
      return {
        id: `p${index}`,
        title: `Note ${index}`,
        area: "university" as const,
        tags: [a, b, "Note"],
        excerpt: "",
      };
    });

    const graph = buildArchiveGraph(pages);
    expect(graph.majorCount).toBe(12);
    expect(graph.minorCount).toBe(0);
    expect(graph.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual(
      expect.arrayContaining([V[0], V[1], V[11]]),
    );
    expect(graph.nodes.some(node => node.kind === "minor")).toBe(false);
    expect(graph.nodes.every(node => node.kind !== "leaf")).toBe(true);
    expect(graph.links.some(link => link.kind === "backbone")).toBe(true);
    expect(graph.links.every(link => link.kind !== "orbit")).toBe(true);
    expect(graph.leaves.get(V[0])?.length).toBeGreaterThan(0);
    expect(graph.nodes.every(node => !/^(EDST|HNO|EDUC|EDED|EDGL)\d/i.test(node.label))).toBe(true);

    const pedagogy = graph.nodes.find(node => node.label === V[2])!;
    expect(pedagogy.color).toBe(colorForTopic(V[2]).fill);
    expect(colorForTopic(V[2]).fill).toBe(KEYWORD_PALETTE[2].fill);
  });
});

describe("topic colours", () => {
  function hue(hex: string) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function hueGap(a: string, b: string) {
    const delta = Math.abs(hue(a) - hue(b));
    return Math.min(delta, 360 - delta);
  }

  it("gives every closed topic its own fill and keeps neighbours in different hue families", () => {
    expect(KEYWORD_PALETTE).toHaveLength(V.length);
    expect(new Set(KEYWORD_PALETTE.map(swatch => swatch.fill)).size).toBe(V.length);
    for (let index = 0; index < KEYWORD_PALETTE.length; index++) {
      const next = KEYWORD_PALETTE[(index + 1) % KEYWORD_PALETTE.length]!;
      expect(hueGap(KEYWORD_PALETTE[index]!.fill, next.fill)).toBeGreaterThanOrEqual(28);
    }
  });
});
