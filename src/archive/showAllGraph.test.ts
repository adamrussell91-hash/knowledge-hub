import { describe, expect, it } from "vitest";
import {
  SHOW_ALL_CLUSTER_GAP,
  buildShowAllGraph,
  showAllClusterRadius,
} from "./showAllGraph";

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

  it("separates major anchors by their cluster footprints", () => {
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
    const pages = majors.flatMap((tag, index) =>
      Array.from({ length: (index + 1) * 4 }, (_, note) => page(`${index}-${note}`, `${tag} ${note}`, [tag])),
    );
    const model = buildShowAllGraph(pages);
    const majorsPlaced = model.nodes.filter(node => node.kind === "major");
    expect(majorsPlaced).toHaveLength(8);
    for (let i = 0; i < majorsPlaced.length; i++) {
      for (let j = i + 1; j < majorsPlaced.length; j++) {
        const left = majorsPlaced[i]!;
        const right = majorsPlaced[j]!;
        const distance = Math.hypot((left.x ?? 0) - (right.x ?? 0), (left.y ?? 0) - (right.y ?? 0));
        expect(distance).toBeGreaterThanOrEqual(
          showAllClusterRadius(left.count) + showAllClusterRadius(right.count) + SHOW_ALL_CLUSTER_GAP,
        );
      }
    }
  });

  it("gives busier hubs more cluster clearance", () => {
    expect(showAllClusterRadius(100)).toBeGreaterThan(showAllClusterRadius(25));
    expect(showAllClusterRadius(25)).toBeGreaterThan(showAllClusterRadius(1));
  });

  it("finds a two-tag overlap without pairing every note that shares one popular tag", () => {
    const pages = Array.from({ length: 40 }, (_, index) => page(`n${index}`, `Note ${index}`, ["Educational Psychology"]));
    pages.push(page("a", "Alpha", ["Educational Psychology", "Gifted Education"]));
    pages.push(page("b", "Beta", ["Educational Psychology", "Gifted Education"]));
    const overlaps = buildShowAllGraph(pages).links.filter(link => link.kind === "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].weight).toBe(2);
  });

  it("seeds notes at distinct organic positions inside their hub cluster", () => {
    const pages = Array.from({ length: 40 }, (_, index) =>
      page(`n${index}`, `Note ${index}`, ["Educational Psychology"]),
    );
    const model = buildShowAllGraph(pages);
    const hub = model.nodes.find(node => node.kind === "major")!;
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const radii = leaves.map(node => Math.hypot((node.x ?? 0) - (hub.x ?? 0), (node.y ?? 0) - (hub.y ?? 0)));
    const positions = new Set(leaves.map(node => `${node.x?.toFixed(3)},${node.y?.toFixed(3)}`));
    expect(positions.size).toBe(leaves.length);
    expect(new Set(radii.map(radius => Math.round(radius))).size).toBeGreaterThan(10);
    expect(Math.max(...radii)).toBeLessThan(showAllClusterRadius(leaves.length));
  });
});
