import { describe, expect, it } from "vitest";
import { startEpisodeOnDo, startNextOnDo, startSeriesOnDo } from "./start";
import { PodcastSeriesSchema, type PodcastEpisode } from "./schema";

describe("startEpisodeOnDo", () => {
  it("returns a running stub without generating turns", async () => {
    const persisted: unknown[] = [];
    const sessions: unknown[] = [];
    const episode = await startEpisodeOnDo(
      { mode: "recap", scope: { area: "notes" }, dials: {} },
      {
        persist: async item => {
          persisted.push(item);
        },
        startSession: async (id, payload) => {
          sessions.push({ id, payload });
        },
        id: () => "ep_stub",
        nowIso: () => "2026-08-15T00:00:00.000Z",
      },
    );

    expect(episode).toMatchObject({
      id: "ep_stub",
      status: "running",
      turns: [],
      mode: "recap",
    });
    expect(persisted).toEqual([episode]);
    expect(sessions).toEqual([
      {
        id: "ep_stub",
        payload: {
          episode,
          commission: expect.objectContaining({ mode: "recap" }),
        },
      },
    ]);
  });
});

describe("startSeriesOnDo", () => {
  it("returns a running episode stub without planning the season", async () => {
    const started: string[] = [];
    const result = await startSeriesOnDo(
      { topic: "SDT", episodeCount: 3, cadence: "weekly", dials: {} },
      {
        persistEpisode: async () => undefined,
        persistSeries: async () => undefined,
        startSession: async id => {
          started.push(id);
        },
        id: () => "ep_series",
        seriesId: () => "ser_stub",
        nowIso: () => "2026-08-15T00:00:00.000Z",
      },
    );

    expect(result.episode).toMatchObject({
      id: "ep_series",
      status: "running",
      turns: [],
      seriesId: "ser_stub",
    });
    expect(result.series.id).toBe("ser_stub");
    expect(started).toEqual(["ep_series"]);
  });
});

describe("startNextOnDo", () => {
  it("returns a running stub for the next slot without generating turns", async () => {
    const series = PodcastSeriesSchema.parse({
      id: "ser_1",
      created_at: "2026-08-15T00:00:00.000Z",
      topic: "SDT",
      cadence: "weekly",
      dials: {},
      showTitle: "Needs",
      openingRitual: "Tea first.",
      vibe: "Staffroom.",
      runningMotifs: ["autonomy"],
      slots: [
        { index: 1, title: "One", throughLine: "Needs", mode: "recap", sourcePageIds: ["p1"], episodeId: "ep_1" },
        { index: 2, title: "Two", throughLine: "Competence", mode: "quiz", sourcePageIds: ["p2"] },
        { index: 3, title: "Three", throughLine: "Relatedness", mode: "debate", sourcePageIds: ["p3"] },
      ],
    });
    const prior: PodcastEpisode = {
      id: "ep_1",
      created_at: "2026-08-15T00:00:00.000Z",
      status: "ready",
      mode: "recap",
      modeDial: {},
      dials: {},
      sourcePageIds: ["p1"],
      turns: [],
      memory: "",
    };
    const sessions: unknown[] = [];
    const episode = await startNextOnDo(series, [prior], {
      persistEpisode: async () => undefined,
      persistSeries: async () => undefined,
      startSession: async (id, payload) => {
        sessions.push({ id, payload });
      },
      id: () => "ep_2",
      nowIso: () => "2026-08-16T00:00:00.000Z",
    });

    expect(episode).toMatchObject({
      id: "ep_2",
      status: "running",
      turns: [],
      mode: "quiz",
      episodeIndex: 2,
    });
    expect(sessions).toEqual([
      {
        id: "ep_2",
        payload: expect.objectContaining({
          generate: expect.objectContaining({ topic: "Competence" }),
        }),
      },
    ]);
  });
});

describe("startNextOnDo", () => {
  it("returns a running stub for the next slot without generating turns", async () => {
    const series = PodcastSeriesSchema.parse({
      id: "ser_1",
      created_at: "2026-08-15T00:00:00.000Z",
      topic: "SDT",
      cadence: "weekly",
      dials: {},
      showTitle: "Needs",
      openingRitual: "Tea first.",
      vibe: "Staffroom.",
      runningMotifs: ["autonomy"],
      slots: [
        { index: 1, title: "One", throughLine: "Needs", mode: "recap", sourcePageIds: ["p1"], episodeId: "ep_1" },
        { index: 2, title: "Two", throughLine: "Competence", mode: "quiz", sourcePageIds: ["p2"] },
        { index: 3, title: "Three", throughLine: "Relatedness", mode: "debate", sourcePageIds: ["p3"] },
      ],
    });
    const prior: PodcastEpisode = {
      id: "ep_1",
      created_at: "2026-08-15T00:00:00.000Z",
      status: "ready",
      mode: "recap",
      modeDial: {},
      dials: {},
      sourcePageIds: ["p1"],
      turns: [],
      memory: "",
    };
    const sessions: unknown[] = [];
    const episode = await startNextOnDo(series, [prior], {
      persistEpisode: async () => undefined,
      persistSeries: async () => undefined,
      startSession: async (id, payload) => {
        sessions.push({ id, payload });
      },
      id: () => "ep_2",
      nowIso: () => "2026-08-16T00:00:00.000Z",
    });

    expect(episode).toMatchObject({
      id: "ep_2",
      status: "running",
      turns: [],
      mode: "quiz",
      episodeIndex: 2,
    });
    expect(sessions).toEqual([
      {
        id: "ep_2",
        payload: expect.objectContaining({
          generate: expect.objectContaining({ topic: "Competence" }),
        }),
      },
    ]);
  });
});
