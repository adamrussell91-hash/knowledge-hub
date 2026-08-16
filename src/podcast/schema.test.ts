import { describe, expect, it } from "vitest";
import { PodcastEpisodeSchema, PodcastSeriesSchema } from "./schema";

describe("podcast schema", () => {
  it("defaults memory to empty and allows a series pointer", () => {
    const episode = PodcastEpisodeSchema.parse({
      id: "ep_1",
      created_at: "2026-08-15T00:00:00.000Z",
      status: "running",
      mode: "recap",
      modeDial: { cadence: "weekly" },
      dials: {},
      sourcePageIds: ["p1"],
      turns: [],
    });
    expect(episode.memory).toBe("");
    expect(episode.dials.length).toBe("standard");
    expect(episode.dials.chicken).toBe(1);
  });

  it("rejects a series with fewer than 3 slots", () => {
    expect(() =>
      PodcastSeriesSchema.parse({
        id: "ser_1",
        created_at: "2026-08-15T00:00:00.000Z",
        topic: "SDT",
        cadence: "weekly",
        dials: {},
        showTitle: "Autonomy Hours",
        openingRitual: "Clementine pours tea.",
        vibe: "Seminar, not a recap dump.",
        runningMotifs: [],
        slots: [
          { index: 1, title: "Map", throughLine: "What is SDT", mode: "recap", sourcePageIds: ["p1"] },
          { index: 2, title: "Needs", throughLine: "Three needs", mode: "recap", sourcePageIds: ["p1"] },
        ],
      }),
    ).toThrow();
  });
});
