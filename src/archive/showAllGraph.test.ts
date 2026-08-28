import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { graphMetrics } from "./graphMetrics";
import { SHOW_ALL_DEGREE_CAP } from "./showAllEdges";
import { buildShowAllGraph, showAllNoteRadius } from "./showAllGraph";

function page(
  id: string,
  title: string,
  tags: string[],
  extra: Partial<{
    area: "notes" | "university";
    excerpt: string;
    origins: { kind: "degree" | "unit" | "notebook"; label: string }[];
  }> = {},
) {
  return {
    id,
    title,
    area: extra.area ?? "notes",
    tags,
    excerpt: extra.excerpt ?? `${title} excerpt`,
    origins: extra.origins,
  };
}

const V = TOPIC_VOCABULARY;

describe("buildShowAllGraph", () => {
  it("emits one node per note, no topic hubs, and a connected edge set", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha regulation", [V[0], V[2]]),
      page("p2", "Beta regulation", [V[0], V[2]]),
      page("p3", "Gamma trauma", [V[7]]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(model.nodes.every(node => node.kind === "leaf")).toBe(true);
    expect(model.links.filter(link => link.kind === "spoke")).toEqual([]);
    expect(leaves.find(node => node.pageId === "p1")?.hubLabels).toEqual([V[0], V[2]]);
    expect(model.majorCount).toBe(3);

    const metrics = graphMetrics(model.nodes, model.links);
    expect(metrics.orphans).toBe(0);
    expect(metrics.components).toBe(1);
    expect(metrics.largestComponentPct).toBe(100);
  });

  it("connects isolated tags through the MST backbone instead of leaving orphans", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", [V[0]], { excerpt: "alpha cluster" }),
      page("p2", "Beta", [V[0]], { excerpt: "alpha cluster" }),
      page("p3", "Gamma", [V[1]], { excerpt: "unrelated trauma case" }),
    ]);
    const metrics = graphMetrics(model.nodes, model.links);
    expect(metrics.orphans).toBe(0);
    expect(metrics.components).toBe(1);
    expect(model.links.some(link => link.kind === "backbone")).toBe(true);
  });

  it("does not turn a popular tag into an all-pairs clique", () => {
    const pages = Array.from({ length: 80 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    const model = buildShowAllGraph(pages);
    const clique = (80 * 79) / 2;
    expect(model.links.length).toBeLessThan(clique / 4);
    expect(model.links.length).toBeGreaterThanOrEqual(79);
    const metrics = graphMetrics(model.nodes, model.links);
    expect(metrics.components).toBe(1);
    expect(metrics.orphans).toBe(0);
    expect(metrics.meanDegree).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
  });

  it("sizes notes by degree so hubs read larger than leaves", () => {
    expect(showAllNoteRadius(16)).toBeGreaterThan(showAllNoteRadius(1));
    const pages = [
      page("hub", "Shared regulation motivation note", [V[0], V[1], V[2]], {
        excerpt: "regulation motivation pedagogy hub",
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        page(`r${index}`, `Regulation ${index}`, [V[0]], { excerpt: "regulation hub" }),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        page(`m${index}`, `Motivation ${index}`, [V[1]], { excerpt: "motivation hub" }),
      ),
    ];
    const model = buildShowAllGraph(pages);
    const radii = model.nodes.map(node => node.r);
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii));
  });

  it("colours tags-view notes by community, not by a hidden topic hub", () => {
    const model = buildShowAllGraph([
      page("p1", "Zimmerman's Component Skills of Self-Regulated Learning", [V[1], V[0]]),
      page("p2", "Self regulation workshop", [V[1]]),
      page("p3", "Another regulation note", [V[1]]),
    ]);
    const leaf = model.nodes.find(node => node.pageId === "p1")!;
    expect(model.nodes.filter(node => node.kind === "major")).toEqual([]);
    expect(leaf.community).toEqual(expect.any(Number));
    expect(leaf.color).toBeTruthy();
    expect(model.nodes.some(node => node.important)).toBe(true);
  });

  it("keeps a two-tag overlap among the scored neighbours", () => {
    const pages = Array.from({ length: 40 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    pages.push(page("a", "Alpha rare pair", [V[0], V[5]], { excerpt: "rare pair overlap" }));
    pages.push(page("b", "Beta rare pair", [V[0], V[5]], { excerpt: "rare pair overlap" }));
    const overlaps = buildShowAllGraph(pages).links.filter(link => link.kind === "overlap" || link.kind === "backbone");
    const pair = overlaps.find(
      link =>
        (String(link.source) === "leaf:a" && String(link.target) === "leaf:b") ||
        (String(link.source) === "leaf:b" && String(link.target) === "leaf:a"),
    );
    expect(pair).toBeTruthy();
  });

  it("seeds the tags view as one cloud around the centre, not per-topic islands", () => {
    const pages = [
      ...Array.from({ length: 20 }, (_, index) => page(`a${index}`, `A ${index}`, [V[0]])),
      ...Array.from({ length: 20 }, (_, index) => page(`b${index}`, `B ${index}`, [V[1]])),
    ];
    const model = buildShowAllGraph(pages);
    const homes = new Set(model.nodes.map(node => `${node.homeX},${node.homeY}`));
    expect(homes.size).toBe(1);
    const metrics = graphMetrics(model.nodes, model.links);
    expect(metrics.components).toBe(1);
    expect(metrics.orphans).toBe(0);
    expect(metrics.meanDegree).toBeGreaterThanOrEqual(3);
  });

  it("builds notebook and degree views from those hubs only", () => {
    const pages = [
      page("n1", "Notebook one", [V[0]], { origins: [{ kind: "notebook", label: "Brown 2022" }] }),
      page("n2", "Notebook two", [V[1]], { origins: [{ kind: "notebook", label: "Brown 2022" }] }),
      page("u1", "Unit note", [V[2]], {
        area: "university",
        origins: [{ kind: "unit", label: "EDST5805" }],
      }),
    ];
    const notebooks = buildShowAllGraph(pages, "notebooks");
    expect(notebooks.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual(["Brown 2022"]);
    expect(notebooks.nodes.filter(node => node.kind === "leaf").map(node => node.pageId).sort()).toEqual(["n1", "n2"]);
    expect(notebooks.links.some(link => link.kind === "spoke")).toBe(true);

    const degrees = buildShowAllGraph(pages, "degrees");
    expect(degrees.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual([
      "Master of Education (Gifted Education)",
    ]);
    expect(degrees.nodes.filter(node => node.kind === "leaf").map(node => node.pageId)).toEqual(["u1"]);
  });
});
