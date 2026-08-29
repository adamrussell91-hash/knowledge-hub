import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { nodeDegrees, noteToNoteLinks } from "./graphMetrics";
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

function noteDegrees(model: ReturnType<typeof buildShowAllGraph>) {
  const leaves = model.nodes.filter(node => node.kind === "leaf");
  return nodeDegrees(leaves, noteToNoteLinks(model.links));
}

describe("buildShowAllGraph", () => {
  it("organises the tags view around topic hubs, with spokes and capped note links", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha regulation", [V[0], V[2]]),
      page("p2", "Beta regulation", [V[0], V[2]]),
      page("p3", "Gamma trauma", [V[7]]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const hubs = model.nodes.filter(node => node.kind === "major");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(hubs.map(node => node.label).sort()).toEqual([V[0], V[2], V[7]].sort());
    expect(model.links.filter(link => link.kind === "spoke" && String(link.source) === "leaf:p1")).toHaveLength(1);
    expect(leaves.find(node => node.pageId === "p1")?.hubLabels).toEqual([V[0], V[2]]);
    expect(leaves.find(node => node.pageId === "p1")?.parentKeyword).toBe(V[0]);
    expect(leaves.find(node => node.pageId === "p1")?.color).toBe(hubs.find(hub => hub.label === V[0])?.color);

    const degrees = [...noteDegrees(model).values()];
    expect(Math.max(0, ...degrees)).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
  });

  it("does not invent note-to-note bridges just to force one component", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", [V[0]], { excerpt: "alpha cluster" }),
      page("p2", "Beta", [V[0]], { excerpt: "alpha cluster" }),
      page("p3", "Gamma", [V[1]], { excerpt: "unrelated trauma case" }),
    ]);
    const noteLinks = noteToNoteLinks(model.links);
    const cross = noteLinks.filter(link => {
      const ends = [String(link.source), String(link.target)].sort().join("|");
      return ends === "leaf:p1|leaf:p3" || ends === "leaf:p2|leaf:p3";
    });
    expect(cross).toEqual([]);
    expect(model.nodes.filter(node => node.kind === "major")).toHaveLength(2);
  });

  it("never lets a note connect to more than 3 other notes", () => {
    const pages = Array.from({ length: 80 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    const model = buildShowAllGraph(pages);
    const clique = (80 * 79) / 2;
    const noteLinks = noteToNoteLinks(model.links);
    expect(noteLinks.length).toBeLessThan(clique / 4);
    expect(noteLinks.length).toBeLessThanOrEqual(80 * SHOW_ALL_DEGREE_CAP / 2);
    const degrees = [...noteDegrees(model).values()];
    expect(Math.max(0, ...degrees)).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
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

  it("colours tags-view notes from their topic hub", () => {
    const model = buildShowAllGraph([
      page("p1", "Zimmerman's Component Skills of Self-Regulated Learning", [V[1], V[0]]),
      page("p2", "Self regulation workshop", [V[1]]),
      page("p3", "Another regulation note", [V[1]]),
    ]);
    const leaf = model.nodes.find(node => node.pageId === "p1")!;
    const hub = model.nodes.find(node => node.kind === "major" && node.label === V[1]);
    expect(hub).toBeTruthy();
    expect(leaf.community).toBeUndefined();
    expect(leaf.color).toBe(hub?.color);
  });

  it("keeps a two-tag overlap among the scored neighbours", () => {
    const pages = Array.from({ length: 40 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    pages.push(page("a", "Alpha rare pair", [V[0], V[5]], { excerpt: "rare pair overlap" }));
    pages.push(page("b", "Beta rare pair", [V[0], V[5]], { excerpt: "rare pair overlap" }));
    const overlaps = noteToNoteLinks(buildShowAllGraph(pages).links);
    const pair = overlaps.find(
      link =>
        (String(link.source) === "leaf:a" && String(link.target) === "leaf:b") ||
        (String(link.source) === "leaf:b" && String(link.target) === "leaf:a"),
    );
    expect(pair).toBeTruthy();
  });

  it("seeds each topic as its own island around that hub", () => {
    const pages = [
      ...Array.from({ length: 20 }, (_, index) => page(`a${index}`, `A ${index}`, [V[0]])),
      ...Array.from({ length: 20 }, (_, index) => page(`b${index}`, `B ${index}`, [V[1]])),
    ];
    const model = buildShowAllGraph(pages);
    const homes = new Set(
      model.nodes.filter(node => node.kind === "leaf").map(node => `${node.homeX},${node.homeY}`),
    );
    expect(homes.size).toBe(2);
    expect(model.nodes.filter(node => node.kind === "major")).toHaveLength(2);
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
