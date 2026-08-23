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
  it("emits one node per note, a spoke to every topic hub, and overlap edges for shared tags", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", [V[0], V[2]]),
      page("p2", "Beta", [V[0], V[2]]),
      page("p3", "Gamma", [V[7]]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(new Set(leaves.map(node => node.id)).size).toBe(3);

    const spokes = model.links.filter(link => link.kind === "spoke");
    expect(spokes.filter(link => String(link.target) === "leaf:p1" || String(link.source) === "leaf:p1").length).toBe(2);
    expect(leaves.find(node => node.pageId === "p1")?.hubLabels).toEqual([V[0], V[2]]);

    const overlaps = model.links.filter(link => link.kind === "overlap");
    expect(overlaps.length).toBeGreaterThanOrEqual(2);
    expect(leaves.every(leaf => leaf.r < 10)).toBe(true);
    expect(model.nodes.filter(node => node.kind === "major").every(node => node.r < 22)).toBe(true);
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

  it("separates major anchors by their cluster footprints", () => {
    const majors = V.slice(0, 8);
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

  it("draws a spoke from a note to each of its topic hubs", () => {
    const model = buildShowAllGraph([
      page("p1", "Zimmerman's Component Skills of Self-Regulated Learning", [V[1], V[0]]),
    ]);
    const leafId = "leaf:p1";
    const spokes = model.links.filter(
      link => link.kind === "spoke" && (String(link.source) === leafId || String(link.target) === leafId),
    );
    expect(spokes).toHaveLength(2);
    const hubs = spokes
      .map(link => (String(link.source) === leafId ? String(link.target) : String(link.source)))
      .sort();
    expect(hubs).toEqual([`major:${V[0]}`, `major:${V[1]}`].sort());
    expect(spokes.map(link => link.color).sort()).toEqual(
      [
        model.nodes.find(node => node.id === `major:${V[0]}`)!.color,
        model.nodes.find(node => node.id === `major:${V[1]}`)!.color,
      ].sort(),
    );
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

  it("seeds notes at distinct organic positions inside their hub cluster", () => {
    const pages = Array.from({ length: 40 }, (_, index) =>
      page(`n${index}`, `Note ${index}`, [V[0]]),
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

    const degrees = buildShowAllGraph(pages, "degrees");
    expect(degrees.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual([
      "Master of Education (Gifted Education)",
    ]);
    expect(degrees.nodes.filter(node => node.kind === "leaf").map(node => node.pageId)).toEqual(["u1"]);
  });
});
