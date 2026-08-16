import { describe, expect, it } from "vitest";
import { SHOW_ALL_LAYOUT_SCALE, buildShowAllGraph } from "./showAllGraph";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: `${title} excerpt` };
}

describe("buildShowAllGraph", () => {
  it("emits one node per note, a spoke to the primary hub, and overlap edges for shared tags", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", ["Educational Psychology", "Pedagogy"]),
      page("p2", "Beta", ["Educational Psychology", "Pedagogy"]),
      page("p3", "Gamma", ["Wellbeing"]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(new Set(leaves.map(node => node.id)).size).toBe(3);

    const spokes = model.links.filter(link => link.kind === "spoke");
    expect(spokes.filter(link => String(link.target) === "leaf:p1" || String(link.source) === "leaf:p1").length).toBe(1);

    const overlaps = model.links.filter(link => link.kind === "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].weight).toBe(2);

    expect(model.nodes.filter(node => node.kind === "major" || node.kind === "minor").every(node => node.r < 40)).toBe(true);
  });

  it("does not emit overlap edges for a single shared tag", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", ["Educational Psychology"]),
      page("p2", "Beta", ["Educational Psychology"]),
    ]);
    expect(model.links.every(link => link.kind !== "overlap")).toBe(true);
  });

  it("seeds majors on distinct radii around the layout centre", () => {
    expect(SHOW_ALL_LAYOUT_SCALE).toBe(10);
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
    const model = buildShowAllGraph(
      majors.map((tag, index) => page(`m${index}`, `Major ${index}`, [tag, majors[(index + 1) % majors.length]])),
    );
    const majorsPlaced = model.nodes.filter(node => node.kind === "major");
    const dists = majorsPlaced.map(node => Math.hypot((node.x ?? 0) - 760, (node.y ?? 0) - 560)).sort((a, b) => a - b);
    expect(new Set(dists.map(dist => Math.round(dist))).size).toBe(majorsPlaced.length);
    expect(dists[0]).toBeGreaterThan(2000);
    for (let i = 1; i < dists.length; i++) {
      expect(dists[i]! - dists[i - 1]!).toBeGreaterThan(1000);
    }
  });

  it("finds a two-tag overlap without pairing every note that shares one popular tag", () => {
    const pages = Array.from({ length: 40 }, (_, index) => page(`n${index}`, `Note ${index}`, ["Educational Psychology"]));
    pages.push(page("a", "Alpha", ["Educational Psychology", "Gifted Education"]));
    pages.push(page("b", "Beta", ["Educational Psychology", "Gifted Education"]));
    const overlaps = buildShowAllGraph(pages).links.filter(link => link.kind === "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].weight).toBe(2);
  });

  it("sits notes on concentric circles around their hub, not a 20-slot spiral", () => {
    const pages = Array.from({ length: 40 }, (_, index) =>
      page(`n${index}`, `Note ${index}`, ["Educational Psychology"]),
    );
    const model = buildShowAllGraph(pages);
    const hub = model.nodes.find(node => node.kind === "major")!;
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const radii = leaves.map(node => Math.hypot((node.x ?? 0) - (hub.x ?? 0), (node.y ?? 0) - (hub.y ?? 0)));
    const rounded = [...new Set(radii.map(radius => Math.round(radius)))].sort((a, b) => a - b);
    expect(rounded.length).toBeGreaterThanOrEqual(1);
    expect(rounded.length).toBeLessThan(40);
    const inner = leaves.filter(node => Math.round(Math.hypot((node.x ?? 0) - (hub.x ?? 0), (node.y ?? 0) - (hub.y ?? 0))) === rounded[0]);
    expect(inner.length).toBeGreaterThan(20);
  });
});
