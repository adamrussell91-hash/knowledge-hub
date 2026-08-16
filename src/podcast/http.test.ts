import { describe, expect, it } from "vitest";
import { handlePodcastRequest } from "./http";
import type { PodcastBindings } from "./http";
import { PodcastEpisodeSchema } from "./schema";

const episode = PodcastEpisodeSchema.parse({
  id: "ep_1",
  created_at: "2026-08-15T00:00:00.000Z",
  status: "running",
  mode: "recap",
  modeDial: {},
  dials: {},
  sourcePageIds: [],
  turns: [],
  memory: "",
});

function bindings(overrides: Partial<PodcastBindings> = {}): PodcastBindings {
  return {
    secret: "kernel-secret",
    allowedOrigin: "https://teaching-hub.example",
    startEpisode: async () => episode,
    startSeries: async () => ({
      series: {
        id: "ser_1",
        created_at: "2026-08-15T00:00:00.000Z",
        topic: "SDT",
        cadence: "weekly",
        dials: episode.dials,
        showTitle: "Autonomy Hours",
        openingRitual: "Clementine pours tea.",
        vibe: "Seminar, not a recap dump.",
        runningMotifs: [],
        slots: [
          { index: 1, title: "Map", throughLine: "What is SDT", mode: "recap", sourcePageIds: ["p1"] },
          { index: 2, title: "Needs", throughLine: "Three needs", mode: "recap", sourcePageIds: ["p1"] },
          { index: 3, title: "Classroom", throughLine: "Autonomy support", mode: "recap", sourcePageIds: ["p1"] },
        ],
      },
      episode,
    }),
    nextInSeries: async () => episode,
    getEpisode: async () => episode,
    getSeries: async () => null,
    listIndex: async () => ({ episodes: [episode], series: [] }),
    interrupt: async () => episode,
    answer: async () => episode,
    ...overrides,
  };
}

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("Origin", "https://teaching-hub.example");
  headers.set("x-research-kernel-secret", "kernel-secret");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Request(url, { ...init, headers });
}

describe("handlePodcastRequest", () => {
  it("rejects missing shared secret", async () => {
    const response = await handlePodcastRequest(
      new Request("https://kernel.test/podcast/start", {
        method: "POST",
        headers: { Origin: "https://teaching-hub.example", "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recap" }),
      }),
      bindings(),
    );
    expect(response.status).toBe(401);
  });

  it("forwards the start body after auth", async () => {
    let received: unknown;
    const body = { mode: "recap", scope: { area: "notes" } };
    const response = await handlePodcastRequest(
      authed("https://kernel.test/podcast/start", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      bindings({
        startEpisode: async payload => {
          received = payload;
          return episode;
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(received).toEqual(body);
    expect(await response.json()).toMatchObject({ id: "ep_1", status: "running" });
  });

  it("lists the podcast index", async () => {
    const response = await handlePodcastRequest(authed("https://kernel.test/podcast/index"), bindings());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ episodes: [episode], series: [] });
  });

  it("returns 422 when series start cannot fill three honest slots", async () => {
    const response = await handlePodcastRequest(
      authed("https://kernel.test/podcast/series/start", {
        method: "POST",
        body: JSON.stringify({ topic: "SDT", episodeCount: 8, cadence: "weekly" }),
      }),
      bindings({
        startSeries: async () => ({ error: "not enough notes", status: 422 }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "not enough notes" });
  });

  it("returns the next-in-series binding status when present", async () => {
    const response = await handlePodcastRequest(
      authed("https://kernel.test/podcast/series/ser_1/next", { method: "POST", body: "{}" }),
      bindings({
        nextInSeries: async () => ({ error: "Previous episode is still generating", status: 409 }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Previous episode is still generating" });
  });

  it("returns the next-in-series binding status when present", async () => {
    const response = await handlePodcastRequest(
      authed("https://kernel.test/podcast/series/ser_1/next", { method: "POST", body: "{}" }),
      bindings({
        nextInSeries: async () => ({ error: "Previous episode is still generating", status: 409 }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Previous episode is still generating" });
  });

  it("returns the interrupt binding status when present", async () => {
    const response = await handlePodcastRequest(
      authed("https://kernel.test/podcast/ep_1/interrupt", {
        method: "POST",
        body: JSON.stringify({ afterTurn: "t1", question: "why?" }),
      }),
      bindings({
        interrupt: async () => ({ error: "busy", status: 409 }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "busy" });
  });
});
