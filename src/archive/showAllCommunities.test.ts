import { describe, expect, it } from "vitest";
import { assignCommunities, nameCommunities } from "./showAllCommunities";

describe("show all communities", () => {
  it("keeps two dense groups in separate communities", () => {
    const edges = [
      { source: 0, target: 1, weight: 1 },
      { source: 1, target: 2, weight: 1 },
      { source: 0, target: 2, weight: 1 },
      { source: 3, target: 4, weight: 1 },
      { source: 4, target: 5, weight: 1 },
      { source: 3, target: 5, weight: 1 },
      { source: 2, target: 3, weight: 0.05 },
    ];
    const assigned = assignCommunities(6, edges, 0.8);
    expect(assigned.count).toBeGreaterThanOrEqual(2);
    expect(new Set(assigned.community.slice(0, 3)).size).toBe(1);
    expect(new Set(assigned.community.slice(3)).size).toBe(1);
    expect(assigned.community[0]).not.toBe(assigned.community[3]);
  });

  it("names a community from the repeated title words", () => {
    const names = nameCommunities(
      ["Self regulation workshop", "Self regulation notes", "Trauma case study"],
      [0, 0, 1],
      2,
    );
    expect(names[0]).toMatch(/regulation|self/);
  });
});
