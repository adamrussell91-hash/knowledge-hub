import { describe, expect, it } from "vitest";
import { buildArchiveGraph, isTopicKeyword } from "./keywordGraph";

describe("archive graph", () => {
  it("builds a three-level major / minor / leaf model without unit codes", () => {
    expect(isTopicKeyword("Cognitive Neuroscience")).toBe(true);
    expect(isTopicKeyword("EDST5805")).toBe(false);

    const pages = Array.from({ length: 200 }, (_, index) => {
      const majors = [
        "Educational Psychology",
        "Pedagogy & Instructional Design",
        "Wellbeing & Mental Health in Schools",
        "Child Development & Wellbeing",
        "Learning Strategies",
        "Gifted Education",
        "Neurodiversity & Special Education",
        "Cognitive Neuroscience",
      ];
      const minors = [
        "Educational Leadership & Policy",
        "Technology in Education",
        "Assessment & Evaluation",
        "Sociocultural Influences on Education",
      ];
      // Heavier major volume so the top-8 cut is stable.
      const major = majors[index % majors.length];
      const bridge = majors[(index + 1) % majors.length];
      const tags = [major, bridge, "Note"];
      if (index % 3 === 0) tags.push(minors[index % minors.length]);
      return {
        id: `p${index}`,
        title: `Note ${index}`,
        area: "university" as const,
        tags,
        excerpt: "",
      };
    });

    const graph = buildArchiveGraph(pages);
    expect(graph.majorCount).toBe(8);
    expect(graph.minorCount).toBe(4);
    expect(graph.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual(
      expect.arrayContaining(["Educational Psychology", "Pedagogy & Instructional Design"]),
    );
    expect(graph.nodes.some(node => node.kind === "minor")).toBe(true);
    expect(graph.nodes.every(node => node.kind !== "leaf")).toBe(true);
    expect(graph.links.some(link => link.kind === "backbone")).toBe(true);
    expect(graph.links.some(link => link.kind === "orbit")).toBe(true);
    expect(graph.links.every(link => link.kind !== "spoke")).toBe(true);
    expect(graph.leaves.get("Technology in Education")?.length).toBeGreaterThan(0);
    expect(graph.nodes.every(node => !/^(EDST|HNO|EDUC|EDED|EDGL)\d/i.test(node.label))).toBe(true);
  });
});
