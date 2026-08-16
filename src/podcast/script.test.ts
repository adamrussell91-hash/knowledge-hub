import { describe, expect, it } from "vitest";
import { buildPodcastPrompt, parsePodcastScript } from "./script";
import type { PodcastDials } from "./schema";

const dials: PodcastDials = {
  length: "short",
  complexity: "academic",
  citationDensity: "normal",
  formality: "staffroom",
  banter: "medium",
  disagreement: "mild",
  chicken: 1,
  pacing: "even",
  interruption: "finish-thought",
};

describe("podcast script", () => {
  it("names both hosts and forbids the open web", () => {
    const prompt = buildPodcastPrompt({
      mode: "recap",
      dials,
      modeDial: { cadence: "weekly" },
      notes: [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
      memories: [],
    });
    expect(prompt).toContain("Professor Clementine Haig");
    expect(prompt).toContain("Ann O’Tation");
    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("p1");
    expect(prompt).not.toMatch(/search the web/i);
  });

  it("injects series bible when present", () => {
    const prompt = buildPodcastPrompt({
      mode: "recap",
      dials: { ...dials, length: "standard" },
      modeDial: {},
      notes: [{ pageId: "p1", title: "SDT", excerpt: "needs" }],
      memories: ["Ep 1 mapped the three needs."],
      bible: { showTitle: "Autonomy Hours", openingRitual: "Tea first.", vibe: "Seminar.", runningMotifs: ["the third need hiding"] },
    });
    expect(prompt).toContain("Autonomy Hours");
    expect(prompt).toContain("Tea first.");
    expect(prompt).toContain("Ep 1 mapped the three needs.");
  });

  it("parses turns and ignores junk", () => {
    const turns = parsePodcastScript(`{"turns":[{"id":"1","speaker":"clementine","kind":"content","text":"Hello","citations":[{"pageId":"p1","title":"SDT"}]}]}`);
    expect(turns[0]?.speaker).toBe("clementine");
  });

  it("strips markdown fences if present", () => {
    const turns = parsePodcastScript(`\`\`\`json
{"turns":[{"id":"2","speaker":"ann","kind":"content","text":"Hello","citations":[]}]}
\`\`\``);
    expect(turns[0]?.speaker).toBe("ann");
    expect(turns[0]?.id).toBe("2");
  });
});
