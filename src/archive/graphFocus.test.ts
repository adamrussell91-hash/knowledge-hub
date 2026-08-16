import { describe, expect, it } from "vitest";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import { isFocusLink, isFocusNode, isSearchHot, nodeMatchesQuery, searchCluster, selectionCluster } from "./graphFocus";

function node(partial: Partial<GraphNodeDatum> & Pick<GraphNodeDatum, "id" | "kind" | "label">): GraphNodeDatum {
  return {
    count: 1,
    color: "#7eb0d5",
    soft: "rgba(126, 176, 213, 0.7)",
    ink: "#315875",
    r: 10,
    ...partial,
  };
}

const nodes: GraphNodeDatum[] = [
  node({ id: "major:A", kind: "major", label: "A" }),
  node({ id: "major:B", kind: "major", label: "B" }),
  node({ id: "minor:a1", kind: "minor", label: "a1", parentKeyword: "A" }),
  node({ id: "minor:a2", kind: "minor", label: "a2", parentKeyword: "A" }),
  node({ id: "minor:b1", kind: "minor", label: "b1", parentKeyword: "B" }),
  node({ id: "leaf:n1", kind: "leaf", label: "Note 1", parentKeyword: "A", pageId: "p1" }),
];

const twins: GraphNodeDatum[] = [
  ...nodes,
  node({ id: "leaf:n1-b", kind: "leaf", label: "Note 1", pageId: "p1", parentKeyword: "B" }),
];

const backbone: GraphLinkDatum = { source: "major:A", target: "major:B", kind: "backbone", weight: 8, color: "#7eb0d5" };
const orbit: GraphLinkDatum = { source: "major:A", target: "minor:a1", kind: "orbit", weight: 3, color: "#7eb0d5" };
const otherOrbit: GraphLinkDatum = { source: "major:B", target: "minor:b1", kind: "orbit", weight: 2, color: "#88b39a" };
const spoke: GraphLinkDatum = { source: "major:A", target: "leaf:n1", kind: "spoke", weight: 1, color: "#7eb0d5" };

describe("graph focus cluster", () => {
  it("treats a selected major as its minors and notes, not other majors", () => {
    const cluster = selectionCluster(nodes, "A");
    expect([...cluster].sort()).toEqual(["A", "Note 1", "a1", "a2"]);
  });

  it("highlights orbit and spoke links for a focused major, not the backbone", () => {
    const cluster = selectionCluster(nodes, "A");
    expect(isFocusLink(backbone, nodes, cluster)).toBe(false);
    expect(isFocusLink(orbit, nodes, cluster)).toBe(true);
    expect(isFocusLink(spoke, nodes, cluster)).toBe(true);
    expect(isFocusLink(otherOrbit, nodes, cluster)).toBe(false);
  });

  it("keeps a selected minor connected to its parent major", () => {
    const cluster = selectionCluster(nodes, "a1");
    expect(cluster.has("A")).toBe(true);
    expect(cluster.has("a1")).toBe(true);
    expect(cluster.has("a2")).toBe(false);
    expect(isFocusLink(orbit, nodes, cluster)).toBe(true);
    expect(isFocusLink(backbone, nodes, cluster)).toBe(false);
  });
});

describe("graph search", () => {
  it("matches keyword labels and note titles, not empty queries", () => {
    expect(nodeMatchesQuery(nodes[0], "")).toBe(true);
    expect(nodeMatchesQuery(nodes[0], "a")).toBe(true);
    expect(nodeMatchesQuery(nodes[0], "zzz")).toBe(false);
    expect(nodeMatchesQuery(nodes[5], "note")).toBe(true);
  });

  it("colours both twin copies of a matching note", () => {
    const cluster = searchCluster(twins, "note 1");
    expect(cluster.has("leaf:n1")).toBe(true);
    expect(cluster.has("leaf:n1-b")).toBe(true);
    expect(cluster.has("major:A")).toBe(false);
  });

  it("empty search colours everyone", () => {
    const cluster = searchCluster(twins, "  ");
    expect(cluster.size).toBe(0);
    expect(twins.every(item => isFocusNode(item, cluster) || cluster.size === 0)).toBe(true);
  });

  it("empty query makes every node hot via isSearchHot", () => {
    expect(twins.every(item => isSearchHot(item, "", twins))).toBe(true);
    expect(twins.every(item => isSearchHot(item, "  ", twins))).toBe(true);
  });

  it("non-empty query with no matches greys every node via isSearchHot", () => {
    expect(twins.every(item => isSearchHot(item, "zzz", twins))).toBe(false);
  });

  it("isSearchHot colours both twin copies of a matching note title", () => {
    const noteA = twins.find(item => item.id === "leaf:n1")!;
    const noteB = twins.find(item => item.id === "leaf:n1-b")!;
    expect(isSearchHot(noteA, "note 1", twins)).toBe(true);
    expect(isSearchHot(noteB, "note 1", twins)).toBe(true);
    expect(isSearchHot(twins[0], "note 1", twins)).toBe(false);
  });
});

describe("leaf selection by page", () => {
  it("keeps every copy of the selected note hot", () => {
    const cluster = selectionCluster(twins, "Note 1");
    expect(cluster.has("Note 1")).toBe(true);
    const copies = twins.filter(item => item.pageId === "p1");
    expect(copies.every(item => isFocusNode(item, cluster))).toBe(true);
  });
});
