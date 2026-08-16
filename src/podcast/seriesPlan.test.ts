import { describe, expect, it } from "vitest";
import { buildSeriesPlanPrompt, groundSeriesPlan } from "./seriesPlan";

const notes = [
  { pageId: "p1", title: "Needs" },
  { pageId: "p2", title: "Causality orientations" },
  { pageId: "p3", title: "Classroom SDT" },
];

describe("groundSeriesPlan", () => {
  it("keeps slots that only cite retrieved notes", () => {
    const plan = groundSeriesPlan(
      {
        showTitle: "Autonomy Hours",
        openingRitual: "Tea.",
        vibe: "Seminar.",
        runningMotifs: [],
        episodes: [
          { index: 1, title: "Map", throughLine: "What is SDT", mode: "recap", sourcePageIds: ["p1"] },
          { index: 2, title: "Orientations", throughLine: "Causality", mode: "recap", sourcePageIds: ["p2"] },
          { index: 3, title: "Classroom", throughLine: "Practice", mode: "quiz", sourcePageIds: ["p3"] },
        ],
      },
      notes,
      8,
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.slots).toHaveLength(3);
  });

  it("fails when fewer than 3 honest slots remain", () => {
    const plan = groundSeriesPlan(
      {
        showTitle: "X",
        openingRitual: "Tea.",
        vibe: "Seminar.",
        runningMotifs: [],
        episodes: [
          { index: 1, title: "Map", throughLine: "What", mode: "recap", sourcePageIds: ["nope"] },
          { index: 2, title: "Map2", throughLine: "What", mode: "recap", sourcePageIds: ["nope"] },
          { index: 3, title: "Map3", throughLine: "What", mode: "recap", sourcePageIds: ["p1"] },
        ],
      },
      notes,
      8,
    );
    expect(plan.ok).toBe(false);
  });
});

describe("buildSeriesPlanPrompt", () => {
  it("contains topic, note ids, Return only JSON, and requested count", () => {
    const prompt = buildSeriesPlanPrompt("SDT", notes, 8);
    expect(prompt).toContain("SDT");
    expect(prompt).toContain("p1");
    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("8");
    expect(prompt).not.toMatch(/search the web/i);
  });
});
