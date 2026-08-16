import { describe, expect, it } from "vitest";
import { buildPodcastPrompt, parsePodcastScript } from "./script";
import { annPodcast, clementinePodcast, podcastEditor } from "../clementine/pack";
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

  it("states the turn budget for the length dial", () => {
    const short = buildPodcastPrompt({
      mode: "recap",
      dials,
      modeDial: {},
      notes: [{ pageId: "p1", title: "SDT", excerpt: "needs" }],
      memories: [],
    });
    const deep = buildPodcastPrompt({
      mode: "recap",
      dials: { ...dials, length: "deep" },
      modeDial: {},
      notes: [{ pageId: "p1", title: "SDT", excerpt: "needs" }],
      memories: [],
    });
    expect(short).toContain("at most 24 turns");
    expect(deep).toContain("at most 90 turns");
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

  it("accepts a bare turns array", () => {
    const turns = parsePodcastScript(
      `[{"id":"1","speaker":"clementine","kind":"content","text":"Hello","citations":[{"pageId":"p1","title":"SDT"}]}]`,
    );
    expect(turns).toHaveLength(1);
    expect(turns[0]?.speaker).toBe("clementine");
  });

  it("keeps complete turns when the JSON is truncated mid-object", () => {
    const turns = parsePodcastScript(
      `{"turns":[{"id":"1","speaker":"clementine","kind":"content","text":"Hello","citations":[]},{"id":"2","speaker":"ann","kind":"content","text":"Half`,
    );
    expect(turns.map(turn => turn.id)).toEqual(["1"]);
  });

  it("skips malformed turns and keeps valid ones", () => {
    const turns = parsePodcastScript(
      JSON.stringify({
        turns: [
          { id: "1", speaker: "clementine", kind: "content", text: "Hello", citations: [] },
          { id: "bad", speaker: "robot", kind: "content", text: "Nope", citations: [] },
          { id: "3", speaker: "ann", kind: "content", text: "Still here", citations: [] },
        ],
      }),
    );
    expect(turns.map(turn => turn.id)).toEqual(["1", "3"]);
  });

  it("mentions a preview when nothing usable can be parsed", () => {
    expect(() => parsePodcastScript("Sorry, I cannot help with that.")).toThrow(/preview:/i);
  });
});

describe("podcast prompts", () => {
  it("makes Clementine answer the previous turn and never address Adam", () => {
    expect(clementinePodcast).toMatch(/immediately preceding turn/i);
    expect(clementinePodcast).toMatch(/never address Adam by name/i);
  });

  it("makes Ann a skeptic who speaks in shorter bursts", () => {
    expect(annPodcast).toMatch(/skeptic/i);
    expect(annPodcast).toMatch(/complicat/i);
    expect(annPodcast).toMatch(/shorter bursts than Clementine/i);
  });

  it("makes the editor rewrite the whole episode and read it aloud", () => {
    expect(podcastEditor).toMatch(/rewrite the entire episode/i);
    expect(podcastEditor).toMatch(/read.{0,20}aloud/i);
  });
});
