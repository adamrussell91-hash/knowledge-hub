import { describe, expect, it } from "vitest";
import { nextSeriesSlot, runGenerate, runInterrupt, runNextEpisode, runQuizAnswer, runSeriesPlan } from "./run";
import { PodcastDialsSchema, PodcastEpisodeSchema, PodcastSeriesSchema, type PodcastEpisode } from "./schema";

const dials = PodcastDialsSchema.parse({});
const now = Date.parse("2026-08-15T00:00:00.000Z");

const notes = [
  { pageId: "p1", title: "SDT", excerpt: "Three basic needs.", updated_at: "2026-08-14T00:00:00.000Z" },
  { pageId: "p2", title: "Causality", excerpt: "Orientations.", updated_at: "2026-08-13T00:00:00.000Z" },
];

function scriptJson(turns: unknown[]) {
  return JSON.stringify({ turns });
}

describe("runGenerate", () => {
  it("returns a ready empty recap when retrieve only has pages before the cutoff", async () => {
    let completed = 0;
    const episode = await runGenerate(
      { mode: "recap", scope: { tags: ["sdt"] }, modeDial: { cadence: "weekly" }, dials, now },
      {
        retrieve: async () => [
          { pageId: "old", title: "Stale", excerpt: "Last month.", updated_at: "2026-08-01T00:00:00.000Z" },
        ],
        complete: async () => {
          completed += 1;
          return scriptJson([]);
        },
        listEpisodes: async () => [],
        id: () => "ep_empty",
        nowIso: () => "2026-08-15T00:00:00.000Z",
      },
    );

    expect(completed).toBe(0);
    expect(episode.status).toBe("ready");
    expect(episode.id).toBe("ep_empty");
    expect(episode.sourcePageIds).toEqual([]);
    expect(episode.turns).toHaveLength(1);
    expect(episode.turns[0]?.speaker).toBe("clementine");
    expect(episode.turns[0]?.kind).toBe("empty");
    expect(episode.turns[0]?.citations).toEqual([]);
    expect(episode.turns[0]?.text.toLowerCase()).toMatch(/nothing new/);
  });

  it("keeps grounded turns and sets sourcePageIds on the happy path", async () => {
    const episode = await runGenerate(
      { mode: "quiz", scope: { tags: ["sdt"] }, modeDial: {}, dials, now },
      {
        retrieve: async () => notes,
        complete: async () =>
          scriptJson([
            {
              id: "t1",
              speaker: "clementine",
              kind: "content",
              text: "Deci named three needs.",
              citations: [{ pageId: "p1", title: "SDT" }],
            },
            {
              id: "t2",
              speaker: "ann",
              kind: "content",
              text: "Causality orientations sit beside that map.",
              citations: [{ pageId: "p2", title: "Causality" }],
            },
          ]),
        listEpisodes: async () => [],
        id: () => "ep_ok",
        nowIso: () => "2026-08-15T00:00:00.000Z",
      },
    );

    expect(episode.status).toBe("running");
    expect(episode.sourcePageIds).toEqual(["p1", "p2"]);
    expect(episode.turns.map(turn => turn.id)).toEqual(["t1", "t2"]);
  });

  it("caps retrieved notes to the length dial before scripting", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      pageId: `p${index + 1}`,
      title: `Note ${index + 1}`,
      excerpt: "Body.",
      updated_at: "2026-08-14T00:00:00.000Z",
    }));
    let prompt = "";
    const episode = await runGenerate(
      { mode: "quiz", modeDial: {}, dials: PodcastDialsSchema.parse({ length: "short" }), now },
      {
        retrieve: async () => many,
        complete: async value => {
          prompt = value;
          return scriptJson([]);
        },
        listEpisodes: async () => [],
        id: () => "ep_notecap",
      },
    );

    expect(episode.sourcePageIds).toHaveLength(12);
    expect(episode.sourcePageIds.at(-1)).toBe("p12");
    expect(prompt).not.toContain("p13");
  });

  it("caps kept turns to the length dial", async () => {
    const script = Array.from({ length: 30 }, (_, index) => ({
      id: `t${index + 1}`,
      speaker: "clementine",
      kind: "content",
      text: "Deci named three needs.",
      citations: [{ pageId: "p1", title: "SDT" }],
    }));
    const episode = await runGenerate(
      { mode: "quiz", modeDial: {}, dials: PodcastDialsSchema.parse({ length: "short" }), now },
      {
        retrieve: async () => notes,
        complete: async () => scriptJson(script),
        listEpisodes: async () => [],
        id: () => "ep_turncap",
      },
    );

    expect(episode.turns).toHaveLength(24);
    expect(episode.turns.at(-1)?.id).toBe("t24");
  });

  it("drops an ungrounded turn from the completed script", async () => {
    const episode = await runGenerate(
      { mode: "quiz", modeDial: {}, dials, now },
      {
        retrieve: async () => notes,
        complete: async () =>
          scriptJson([
            {
              id: "t1",
              speaker: "clementine",
              kind: "content",
              text: "Deci named three needs.",
              citations: [{ pageId: "p1", title: "SDT" }],
            },
            {
              id: "t-bad",
              speaker: "ann",
              kind: "content",
              text: "The open web disagrees.",
              citations: [{ pageId: "web", title: "Web" }],
            },
          ]),
        listEpisodes: async () => [],
        id: () => "ep_ground",
      },
    );

    expect(episode.turns.map(turn => turn.id)).toEqual(["t1"]);
    expect(episode.sourcePageIds).toEqual(["p1", "p2"]);
  });
});

describe("runSeriesPlan", () => {
  it("caps planning notes at the deep budget", async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      pageId: `p${index + 1}`,
      title: `Note ${index + 1}`,
      excerpt: "Body.",
    }));
    let prompt = "";
    await runSeriesPlan(
      { topic: "SDT", episodeCount: 8, cadence: "weekly", dials },
      {
        retrieve: async () => many,
        complete: async value => {
          prompt = value;
          return JSON.stringify({
            showTitle: "Autonomy Hours",
            openingRitual: "Tea.",
            vibe: "Seminar.",
            runningMotifs: [],
            episodes: [],
          });
        },
      },
    );

    expect(prompt).toContain("p40");
    expect(prompt).not.toContain("p41");
  });

  it("fails when fewer than 3 slots can be grounded", async () => {
    const result = await runSeriesPlan(
      { topic: "SDT", episodeCount: 8, cadence: "weekly", dials },
      {
        retrieve: async () => notes,
        complete: async () =>
          JSON.stringify({
            showTitle: "Autonomy Hours",
            openingRitual: "Tea.",
            vibe: "Seminar.",
            runningMotifs: [],
            episodes: [
              { index: 1, title: "Map", throughLine: "What is SDT", mode: "recap", sourcePageIds: ["p1"] },
              { index: 2, title: "Orientations", throughLine: "Causality", mode: "recap", sourcePageIds: ["p2"] },
              { index: 3, title: "Invented", throughLine: "Web", mode: "quiz", sourcePageIds: ["nope"] },
            ],
          }),
      },
    );
    expect(result).toMatchObject({ status: 422 });
    if (!("error" in result)) return;
    expect(result.error).toMatch(/at least 3/);
  });
});

function readyEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return PodcastEpisodeSchema.parse({
    id: "ep_1",
    created_at: "2026-08-15T00:00:00.000Z",
    status: "ready",
    mode: "quiz",
    scope: { tags: ["sdt"] },
    modeDial: {},
    dials: {},
    sourcePageIds: ["p1"],
    turns: [
      {
        id: "t1",
        speaker: "clementine",
        kind: "content",
        text: "Deci named three needs.",
        citations: [{ pageId: "p1", title: "SDT" }],
      },
      {
        id: "t2",
        speaker: "ann",
        kind: "content",
        text: "Autonomy is one of them.",
        citations: [{ pageId: "p1", title: "SDT" }],
      },
    ],
    memory: "",
    ...overrides,
  });
}

function isBusy(result: PodcastEpisode | { status: number; error: string }): result is { status: number; error: string } {
  return typeof result.status === "number";
}

describe("runInterrupt", () => {
  it("returns 409 and does not complete while the episode is still generating", async () => {
    let completed = 0;
    const result = await runInterrupt(
      readyEpisode({ status: "running" }),
      { afterTurn: "t1", question: "What are the three needs?" },
      {
        retrieve: async () => notes,
        complete: async () => {
          completed += 1;
          return scriptJson([]);
        },
      },
    );

    expect(result).toEqual({ status: 409, error: "still generating" });
    expect(completed).toBe(0);
  });

  it("splices a grounded interrupt after afterTurn and keeps original turns", async () => {
    const order: string[] = [];
    const result = await runInterrupt(
      readyEpisode(),
      { afterTurn: "t1", question: "What are the three needs?" },
      {
        retrieve: async () => {
          order.push("retrieve");
          return [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }];
        },
        complete: async prompt => {
          order.push("complete");
          expect(prompt).toMatch(/What are the three needs\?/);
          expect(prompt).toMatch(/interrupt/i);
          expect(prompt).toMatch(/SDT/);
          expect(prompt).toMatch(/Deci named three needs/);
          return scriptJson([
            {
              id: "int1",
              speaker: "clementine",
              kind: "interrupt",
              text: "The three needs live in that note.",
              citations: [{ pageId: "p1", title: "SDT" }],
            },
          ]);
        },
      },
    );

    expect(isBusy(result)).toBe(false);
    if (isBusy(result)) return;
    expect(result.id).toBe("ep_1");
    expect(result.status).toBe("ready");
    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "int1", "t2"]);
    expect(order).toEqual(["retrieve", "complete"]);
  });

  it("drops an ungrounded interrupt turn", async () => {
    const result = await runInterrupt(
      readyEpisode(),
      { afterTurn: "t1", question: "What does the web say?" },
      {
        retrieve: async () => [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
        complete: async () =>
          scriptJson([
            {
              id: "int-bad",
              speaker: "ann",
              kind: "interrupt",
              text: "Wikipedia says otherwise.",
              citations: [{ pageId: "web", title: "Web" }],
            },
          ]),
      },
    );

    expect(isBusy(result)).toBe(false);
    if (isBusy(result)) return;
    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "t2"]);
    expect(result.turns.some(turn => turn.id === "int-bad")).toBe(false);
  });

  it("retrieves sourcePageIds first and does not use extra scope pages", async () => {
    const calls: Array<{ pageIds?: string[] }> = [];
    let prompt = "";
    const result = await runInterrupt(
      readyEpisode(),
      { afterTurn: "t1", question: "What are the three needs?" },
      {
        retrieve: async (_query, _scope, pageIds) => {
          calls.push({ pageIds });
          if (pageIds?.length) {
            return [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }];
          }
          return [
            { pageId: "p1", title: "SDT", excerpt: "Three basic needs." },
            { pageId: "p-extra", title: "Other", excerpt: "Not in this episode." },
          ];
        },
        complete: async text => {
          prompt = text;
          return scriptJson([
            {
              id: "int1",
              speaker: "clementine",
              kind: "interrupt",
              text: "The three needs live in that note.",
              citations: [{ pageId: "p1", title: "SDT" }],
            },
          ]);
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.pageIds).toEqual(["p1"]);
    expect(prompt).not.toMatch(/p-extra|Not in this episode/);
    expect(isBusy(result)).toBe(false);
    if (isBusy(result)) return;
    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "int1", "t2"]);
  });

  it("falls back to a scope retrieve without pageIds when the restricted set is empty", async () => {
    const calls: Array<{ pageIds?: string[] }> = [];
    const result = await runInterrupt(
      readyEpisode(),
      { afterTurn: "t1", question: "What else is in scope?" },
      {
        retrieve: async (_query, _scope, pageIds) => {
          calls.push({ pageIds });
          if (pageIds?.length) return [];
          return [{ pageId: "p-scope", title: "Scope note", excerpt: "Outside the episode pages." }];
        },
        complete: async () =>
          scriptJson([
            {
              id: "int-scope",
              speaker: "ann",
              kind: "interrupt",
              text: "Closest note is outside the original pages.",
              citations: [{ pageId: "p-scope", title: "Scope note" }],
            },
          ]),
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.pageIds).toEqual(["p1"]);
    expect(calls[1]?.pageIds).toBeUndefined();
    expect(isBusy(result)).toBe(false);
    if (isBusy(result)) return;
    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "int-scope", "t2"]);
  });
});

function seriesFixture(
  slots: Array<{ episodeId?: string; throughLine?: string; mode?: PodcastEpisode["mode"] }> = [{}, {}, {}],
) {
  return PodcastSeriesSchema.parse({
    id: "ser_1",
    created_at: "2026-08-15T00:00:00.000Z",
    topic: "SDT",
    cadence: "weekly",
    dials: {},
    showTitle: "Autonomy Hours",
    openingRitual: "Tea first.",
    vibe: "Seminar.",
    runningMotifs: ["the third need"],
    slots: [
      {
        index: 1,
        title: "Map",
        throughLine: slots[0]?.throughLine ?? "What is SDT",
        mode: slots[0]?.mode ?? "recap",
        sourcePageIds: ["p1"],
        ...(slots[0]?.episodeId ? { episodeId: slots[0].episodeId } : {}),
      },
      {
        index: 2,
        title: "Needs",
        throughLine: slots[1]?.throughLine ?? "Three needs",
        mode: slots[1]?.mode ?? "quiz",
        sourcePageIds: ["p1"],
        ...(slots[1]?.episodeId ? { episodeId: slots[1].episodeId } : {}),
      },
      {
        index: 3,
        title: "Classroom",
        throughLine: slots[2]?.throughLine ?? "Practice",
        mode: slots[2]?.mode ?? "debate",
        sourcePageIds: ["p1"],
        ...(slots[2]?.episodeId ? { episodeId: slots[2].episodeId } : {}),
      },
    ],
  });
}

describe("nextSeriesSlot", () => {
  it("returns the first slot without an episodeId", () => {
    const result = nextSeriesSlot(seriesFixture(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot.index).toBe(1);
    expect(result.slot.throughLine).toBe("What is SDT");
  });

  it("returns 409 when the previous episode is still running", () => {
    const result = nextSeriesSlot(seriesFixture([{ episodeId: "ep_1" }, {}, {}]), {
      ep_1: { status: "running" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/previous|still|generating|ready/i);
  });

  it("returns 422 when every slot already has a recorded episode", () => {
    const result = nextSeriesSlot(
      seriesFixture([{ episodeId: "ep_1" }, { episodeId: "ep_2" }, { episodeId: "ep_3" }]),
      {
        ep_1: { status: "ready" },
        ep_2: { status: "ready" },
        ep_3: { status: "cancelled" },
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.error).toMatch(/no remaining|no more|complete/i);
  });

  it("treats a missing episode as an open slot after a ready predecessor", () => {
    const result = nextSeriesSlot(seriesFixture([{ episodeId: "ep_1" }, { episodeId: "ep_missing" }, {}]), {
      ep_1: { status: "ready" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot.index).toBe(2);
    expect(result.slot.episodeId).toBe("ep_missing");
  });
});

describe("runNextEpisode", () => {
  it("generates the open slot with throughLine as the retrieve topic", async () => {
    const queries: string[] = [];
    const result = await runNextEpisode(seriesFixture([{}, {}, {}]), [], {
      retrieve: async query => {
        queries.push(query);
        return notes;
      },
      complete: async () =>
        scriptJson([
          {
            id: "t1",
            speaker: "clementine",
            kind: "content",
            text: "Deci named three needs.",
            citations: [{ pageId: "p1", title: "SDT" }],
          },
        ]),
      listEpisodes: async () => [],
      id: () => "ep_next",
      nowIso: () => "2026-08-15T00:00:00.000Z",
    });

    expect("status" in result && result.status === 409).toBe(false);
    expect("status" in result && result.status === 422).toBe(false);
    if ("error" in result) return;
    expect(queries[0]).toBe("What is SDT");
    expect(result.mode).toBe("recap");
    expect(result.seriesId).toBe("ser_1");
    expect(result.episodeIndex).toBe(1);
    expect(result.showTitle).toBe("Autonomy Hours");
    expect(result.id).toBe("ep_next");
  });

  it("returns 409 without generating when the previous episode is not ready", async () => {
    let retrieved = 0;
    const result = await runNextEpisode(
      seriesFixture([{ episodeId: "ep_1" }, {}, {}]),
      [readyEpisode({ id: "ep_1", status: "running", seriesId: "ser_1" })],
      {
        retrieve: async () => {
          retrieved += 1;
          return notes;
        },
        complete: async () => scriptJson([]),
        listEpisodes: async () => [],
      },
    );

    expect(result).toMatchObject({ status: 409 });
    expect(retrieved).toBe(0);
  });
});


describe("nextSeriesSlot", () => {
  it("returns the first slot without an episodeId", () => {
    const result = nextSeriesSlot(seriesFixture(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot.index).toBe(1);
    expect(result.slot.throughLine).toBe("What is SDT");
  });

  it("returns 409 when the previous episode is still running", () => {
    const result = nextSeriesSlot(seriesFixture([{ episodeId: "ep_1" }, {}, {}]), {
      ep_1: { status: "running" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/previous|still|generating|ready/i);
  });

  it("returns 422 when every slot already has a recorded episode", () => {
    const result = nextSeriesSlot(
      seriesFixture([{ episodeId: "ep_1" }, { episodeId: "ep_2" }, { episodeId: "ep_3" }]),
      {
        ep_1: { status: "ready" },
        ep_2: { status: "ready" },
        ep_3: { status: "cancelled" },
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.error).toMatch(/no remaining|no more|complete/i);
  });

  it("treats a missing episode as an open slot after a ready predecessor", () => {
    const result = nextSeriesSlot(seriesFixture([{ episodeId: "ep_1" }, { episodeId: "ep_missing" }, {}]), {
      ep_1: { status: "ready" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot.index).toBe(2);
    expect(result.slot.episodeId).toBe("ep_missing");
  });
});

describe("runNextEpisode", () => {
  it("generates the open slot with throughLine as the retrieve topic", async () => {
    const queries: string[] = [];
    const result = await runNextEpisode(seriesFixture([{}, {}, {}]), [], {
      retrieve: async query => {
        queries.push(query);
        return notes;
      },
      complete: async () =>
        scriptJson([
          {
            id: "t1",
            speaker: "clementine",
            kind: "content",
            text: "Deci named three needs.",
            citations: [{ pageId: "p1", title: "SDT" }],
          },
        ]),
      listEpisodes: async () => [],
      id: () => "ep_next",
      nowIso: () => "2026-08-15T00:00:00.000Z",
    });

    expect("status" in result && result.status === 409).toBe(false);
    expect("status" in result && result.status === 422).toBe(false);
    if ("error" in result) return;
    expect(queries[0]).toBe("What is SDT");
    expect(result.mode).toBe("recap");
    expect(result.seriesId).toBe("ser_1");
    expect(result.episodeIndex).toBe(1);
    expect(result.showTitle).toBe("Autonomy Hours");
    expect(result.id).toBe("ep_next");
  });

  it("returns 409 without generating when the previous episode is not ready", async () => {
    let retrieved = 0;
    const result = await runNextEpisode(
      seriesFixture([{ episodeId: "ep_1" }, {}, {}]),
      [readyEpisode({ id: "ep_1", status: "running", seriesId: "ser_1" })],
      {
        retrieve: async () => {
          retrieved += 1;
          return notes;
        },
        complete: async () => scriptJson([]),
        listEpisodes: async () => [],
      },
    );

    expect(result).toMatchObject({ status: 409 });
    expect(retrieved).toBe(0);
  });
});

describe("runQuizAnswer", () => {
  it("inserts a model-answer after the quiz-prompt", async () => {
    const episode = readyEpisode({
      turns: [
        {
          id: "t1",
          speaker: "clementine",
          kind: "content",
          text: "Deci named three needs.",
          citations: [{ pageId: "p1", title: "SDT" }],
        },
        {
          id: "q1",
          speaker: "ann",
          kind: "quiz-prompt",
          text: "Name one basic need.",
          citations: [],
        },
        {
          id: "t2",
          speaker: "clementine",
          kind: "content",
          text: "We will come back to that.",
          citations: [{ pageId: "p1", title: "SDT" }],
        },
      ],
    });

    const result = await runQuizAnswer(episode, { afterTurn: "t1", text: "Autonomy?" }, {
      retrieve: async () => [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
      complete: async prompt => {
        expect(prompt).toMatch(/Autonomy\?/);
        expect(prompt).toMatch(/Name one basic need/);
        return scriptJson([
          {
            id: "a1",
            speaker: "clementine",
            kind: "model-answer",
            text: "Autonomy is one of the three needs.",
            citations: [{ pageId: "p1", title: "SDT" }],
          },
        ]);
      },
    });

    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "q1", "a1", "t2"]);
    expect(result.id).toBe("ep_1");
    expect(result.status).toBe("ready");
  });
});





describe("runInterrupt", () => {
  it("returns 409 and does not complete while the episode is still generating", async () => {
    let completed = 0;
    const result = await runInterrupt(
      readyEpisode({ status: "running" }),
      { afterTurn: "t1", question: "What are the three needs?" },
      {
        retrieve: async () => notes,
        complete: async () => {
          completed += 1;
          return scriptJson([]);
        },
      },
    );

    expect(result).toEqual({ status: 409, error: "still generating" });
    expect(completed).toBe(0);
  });

  it("splices a grounded interrupt after afterTurn and keeps original turns", async () => {
    const order: string[] = [];
    const result = await runInterrupt(
      readyEpisode(),
      { afterTurn: "t1", question: "What are the three needs?" },
      {
        retrieve: async () => {
          order.push("retrieve");
          return [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }];
        },
        complete: async prompt => {
          order.push("complete");
          expect(prompt).toMatch(/What are the three needs\?/);
          expect(prompt).toMatch(/interrupt/i);
          expect(prompt).toMatch(/SDT/);
          expect(prompt).toMatch(/Deci named three needs/);
          return scriptJson([
            {
              id: "int1",
              speaker: "clementine",
              kind: "interrupt",
              text: "The three needs live in that note.",
              citations: [{ pageId: "p1", title: "SDT" }],
            },
          ]);
        },
      },
    );

    expect(isBusy(result)).toBe(false);
    if (isBusy(result)) return;
    expect(result.id).toBe("ep_1");
    expect(result.status).toBe("ready");
    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "int1", "t2"]);
    expect(order).toEqual(["retrieve", "complete"]);
  });

  it("drops an ungrounded interrupt turn", async () => {
    const result = await runInterrupt(
      readyEpisode(),
      { afterTurn: "t1", question: "What does the web say?" },
      {
        retrieve: async () => [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
        complete: async () =>
          scriptJson([
            {
              id: "int-bad",
              speaker: "ann",
              kind: "interrupt",
              text: "Wikipedia says otherwise.",
              citations: [{ pageId: "web", title: "Web" }],
            },
          ]),
      },
    );

    expect(isBusy(result)).toBe(false);
    if (isBusy(result)) return;
    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "t2"]);
    expect(result.turns.some(turn => turn.id === "int-bad")).toBe(false);
  });
});

describe("runQuizAnswer", () => {
  it("inserts a model-answer after the quiz-prompt", async () => {
    const episode = readyEpisode({
      turns: [
        {
          id: "t1",
          speaker: "clementine",
          kind: "content",
          text: "Deci named three needs.",
          citations: [{ pageId: "p1", title: "SDT" }],
        },
        {
          id: "q1",
          speaker: "ann",
          kind: "quiz-prompt",
          text: "Name one basic need.",
          citations: [],
        },
        {
          id: "t2",
          speaker: "clementine",
          kind: "content",
          text: "We will come back to that.",
          citations: [{ pageId: "p1", title: "SDT" }],
        },
      ],
    });

    const result = await runQuizAnswer(episode, { afterTurn: "t1", text: "Autonomy?" }, {
      retrieve: async () => [{ pageId: "p1", title: "SDT", excerpt: "Three basic needs." }],
      complete: async prompt => {
        expect(prompt).toMatch(/Autonomy\?/);
        expect(prompt).toMatch(/Name one basic need/);
        return scriptJson([
          {
            id: "a1",
            speaker: "clementine",
            kind: "model-answer",
            text: "Autonomy is one of the three needs.",
            citations: [{ pageId: "p1", title: "SDT" }],
          },
        ]);
      },
    });

    expect(result.turns.map(turn => turn.id)).toEqual(["t1", "q1", "a1", "t2"]);
    expect(result.id).toBe("ep_1");
    expect(result.status).toBe("ready");
  });
});
