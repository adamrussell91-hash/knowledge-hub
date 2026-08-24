import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import {
  SHOW_ALL_CLUSTER_GAP,
  buildShowAllGraph,
  overlapVisitOrder,
  showAllClusterRadius,
} from "./showAllGraph";

function page(
  id: string,
  title: string,
  tags: string[],
  extra: Partial<{ area: "notes" | "university"; origins: { kind: "degree" | "unit" | "notebook"; label: string }[] }> = {},
) {
  return { id, title, area: extra.area ?? "notes", tags, excerpt: `${title} excerpt`, origins: extra.origins };
}

const V = TOPIC_VOCABULARY;

describe("buildShowAllGraph", () => {
  it("emits one node per note and overlap edges, with no topic hubs or spokes", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", [V[0], V[2]]),
      page("p2", "Beta", [V[0], V[2]]),
      page("p3", "Gamma", [V[7]]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(new Set(leaves.map(node => node.id)).size).toBe(3);
    expect(model.nodes.every(node => node.kind === "leaf")).toBe(true);
    expect(model.links.filter(link => link.kind === "spoke")).toEqual([]);
    expect(leaves.find(node => node.pageId === "p1")?.hubLabels).toEqual([V[0], V[2]]);
    expect(model.majorCount).toBe(3);

    const overlaps = model.links.filter(link => link.kind === "overlap");
    expect(overlaps.length).toBeGreaterThanOrEqual(2);
    expect(leaves.every(leaf => leaf.r < 10)).toBe(true);
  });

  it("gives every note at least two overlap ties, including a single shared tag", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", [V[0]]),
      page("p2", "Beta", [V[0]]),
      page("p3", "Gamma", [V[1]]),
    ]);
    const degree = new Map<string, number>();
    for (const link of model.links.filter(item => item.kind === "overlap")) {
      const source = String(link.source);
      const target = String(link.target);
      degree.set(source, (degree.get(source) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
    expect(degree.get("leaf:p1") ?? 0).toBeGreaterThanOrEqual(2);
    expect(degree.get("leaf:p2") ?? 0).toBeGreaterThanOrEqual(2);
    expect(degree.get("leaf:p3") ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("separates topic clusters by their footprints without drawing hubs", () => {
    const majors = V.slice(0, 8);
    const pages = majors.flatMap((tag, index) =>
      Array.from({ length: (index + 1) * 4 }, (_, note) => page(`${index}-${note}`, `${tag} ${note}`, [tag])),
    );
    const model = buildShowAllGraph(pages);
    expect(model.nodes.filter(node => node.kind === "major")).toEqual([]);
    const homes = new Map<string, { x: number; y: number; count: number }>();
    for (const node of model.nodes) {
      const key = node.parentKeyword ?? "";
      const existing = homes.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      homes.set(key, { x: node.homeX ?? 0, y: node.homeY ?? 0, count: 1 });
    }
    const placed = [...homes.values()];
    expect(placed).toHaveLength(8);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const left = placed[i]!;
        const right = placed[j]!;
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
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

  it("keeps topic colour on a multi-tag note without drawing hubs or spokes", () => {
    const model = buildShowAllGraph([
      page("p1", "Zimmerman's Component Skills of Self-Regulated Learning", [V[1], V[0]]),
    ]);
    const leaf = model.nodes.find(node => node.pageId === "p1")!;
    expect(model.nodes.filter(node => node.kind === "major")).toEqual([]);
    expect(model.links.filter(link => link.kind === "spoke")).toEqual([]);
    expect(leaf.hubLabels).toEqual([V[1], V[0]]);
    expect(leaf.color).toBeTruthy();
    expect(model.majorCount).toBe(2);
  });

  it("walks each topic in turn so the first tag cannot consume the edge budget", () => {
    expect(overlapVisitOrder(["gold", "gold", "blue", "gold", "blue"])).toEqual([0, 2, 1, 4, 3]);
  });

  it("spreads overlap lines across topic clusters instead of filling only the first tag", () => {
    const pages = [
      ...Array.from({ length: 80 }, (_, index) => page(`a${index}`, `A ${index}`, [V[0]])),
      ...Array.from({ length: 80 }, (_, index) => page(`b${index}`, `B ${index}`, [V[1]])),
      ...Array.from({ length: 80 }, (_, index) => page(`c${index}`, `C ${index}`, [V[2]])),
    ];
    const overlaps = buildShowAllGraph(pages).links.filter(link => link.kind === "overlap");
    const cluster = (id: string) => (id.includes(":a") ? "a" : id.includes(":b") ? "b" : "c");
    const counts = { a: 0, b: 0, c: 0 };
    for (const link of overlaps) {
      counts[cluster(String(link.source))] += 1;
      counts[cluster(String(link.target))] += 1;
    }
    expect(counts.a).toBeGreaterThan(40);
    expect(counts.b).toBeGreaterThan(40);
    expect(counts.c).toBeGreaterThan(40);
  });

  it("prefers a two-tag overlap over pairing every note that shares one popular tag", () => {
    const pages = Array.from({ length: 40 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    pages.push(page("a", "Alpha", [V[0], V[5]]));
    pages.push(page("b", "Beta", [V[0], V[5]]));
    const overlaps = buildShowAllGraph(pages).links.filter(link => link.kind === "overlap");
    const pair = overlaps.find(
      link =>
        (String(link.source) === "leaf:a" && String(link.target) === "leaf:b") ||
        (String(link.source) === "leaf:b" && String(link.target) === "leaf:a"),
    );
    expect(pair).toBeTruthy();
    expect(pair?.weight).toBe(2);
  });

  it("seeds notes at distinct organic positions inside their topic cluster", () => {
    const pages = Array.from({ length: 40 }, (_, index) =>
      page(`n${index}`, `Note ${index}`, [V[0]]),
    );
    const model = buildShowAllGraph(pages);
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const origin = { x: leaves[0]!.homeX ?? 0, y: leaves[0]!.homeY ?? 0 };
    const radii = leaves.map(node => Math.hypot((node.x ?? 0) - origin.x, (node.y ?? 0) - origin.y));
    const positions = new Set(leaves.map(node => `${node.x?.toFixed(3)},${node.y?.toFixed(3)}`));
    expect(positions.size).toBe(leaves.length);
    expect(new Set(radii.map(radius => Math.round(radius))).size).toBeGreaterThan(10);
    expect(Math.max(...radii)).toBeLessThan(showAllClusterRadius(leaves.length));
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
