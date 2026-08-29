import { describe, expect, it } from "vitest";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import {
  SHOW_ALL_EDGE_BUDGET_FAR,
  SHOW_ALL_EDGE_BUDGET_NEAR,
  pickShowAllLinksToDraw,
  rankShowAllLinks,
  showAllDrawRings,
  showAllEdgeBudget,
  showAllLabelVisible,
} from "./showAllDraw";

function leaf(id: string, extra: Partial<GraphNodeDatum> = {}): GraphNodeDatum {
  return {
    id,
    kind: "leaf",
    label: id,
    count: 1,
    color: "#5b8ec8",
    soft: "rgba(91, 142, 200, 0.7)",
    ink: "#294c71",
    r: 5,
    ...extra,
  };
}

function link(partial: Partial<GraphLinkDatum> & Pick<GraphLinkDatum, "source" | "target" | "kind">): GraphLinkDatum {
  return { weight: 1, color: "rgba(160, 160, 160, 0.7)", ...partial };
}

describe("show all draw budget", () => {
  it("keeps a small far-zoom budget and a larger near-zoom budget", () => {
    expect(showAllEdgeBudget(0.16)).toBe(SHOW_ALL_EDGE_BUDGET_FAR);
    expect(showAllEdgeBudget(0.9)).toBe(SHOW_ALL_EDGE_BUDGET_NEAR);
    expect(SHOW_ALL_EDGE_BUDGET_FAR).toBeLessThan(SHOW_ALL_EDGE_BUDGET_NEAR);
  });

  it("draws backbone edges before ordinary overlaps", () => {
    const ranked = rankShowAllLinks([
      link({ source: "a", target: "b", kind: "overlap", weight: 9 }),
      link({ source: "c", target: "d", kind: "backbone", weight: 0.1 }),
    ]);
    expect(ranked[0]?.kind).toBe("backbone");
    expect(ranked[1]?.kind).toBe("overlap");
  });

  it("caps the drawn set and still keeps highlighted extras", () => {
    const ranked = Array.from({ length: SHOW_ALL_EDGE_BUDGET_FAR + 40 }, (_, index) =>
      link({ source: `n${index}`, target: `n${index + 1}`, kind: "overlap", weight: SHOW_ALL_EDGE_BUDGET_FAR - index }),
    );
    const keep = ranked[ranked.length - 1]!;
    const picked = pickShowAllLinksToDraw(ranked, 0.16, { keepExtra: link => link === keep });
    expect(picked).toHaveLength(SHOW_ALL_EDGE_BUDGET_FAR + 1);
    expect(picked).toContain(keep);
  });

  it("shows leaf titles only in a selected neighborhood and skips rings when zoomed out", () => {
    const note = leaf("leaf:n1", { important: true, degree: 40 });
    expect(showAllLabelVisible(note, 1.8)).toBe(false);
    expect(showAllLabelVisible(note, 0.2, true)).toBe(false);
    expect(showAllLabelVisible(note, 0.9, false, true)).toBe(true);
    expect(showAllDrawRings(0.16)).toBe(false);
    expect(showAllDrawRings(0.4)).toBe(true);
  });
});
