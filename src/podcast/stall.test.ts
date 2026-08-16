import { describe, expect, it } from "vitest";
import { PodcastEpisodeSchema, type PodcastEpisode } from "./schema";
import { STALL_LIMIT_MS, isStalledEpisode, markStalledEpisode } from "./stall";

const created = "2026-08-16T08:54:44.000Z";
const createdMs = Date.parse(created);

function episode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return PodcastEpisodeSchema.parse({
    id: "ep_stall",
    created_at: created,
    status: "running",
    mode: "connector",
    sourcePageIds: [],
    turns: [],
    ...overrides,
  });
}

describe("isStalledEpisode", () => {
  it("leaves a recent running episode alone", () => {
    expect(isStalledEpisode(episode(), createdMs + STALL_LIMIT_MS - 1000)).toBe(false);
  });

  it("flags a running episode that has not progressed past the limit", () => {
    expect(isStalledEpisode(episode(), createdMs + STALL_LIMIT_MS + 1000)).toBe(true);
  });

  it("measures from progress_at once a batch has landed", () => {
    const later = new Date(createdMs + 10 * 60_000).toISOString();
    const recent = episode({ progress_at: later });
    expect(isStalledEpisode(recent, createdMs + 11 * 60_000)).toBe(false);
    expect(isStalledEpisode(recent, createdMs + 15 * 60_000)).toBe(true);
  });

  it("never flags an episode that is not running", () => {
    expect(isStalledEpisode(episode({ status: "ready" }), createdMs + 60 * 60_000)).toBe(false);
    expect(isStalledEpisode(episode({ status: "error" }), createdMs + 60 * 60_000)).toBe(false);
  });
});

describe("markStalledEpisode", () => {
  it("fails a script-stage stall with a reason", () => {
    const failed = markStalledEpisode(episode());
    expect(failed.status).toBe("error");
    expect(failed.error).toContain("writing the script");
    expect(failed.error).toContain("4 minutes");
  });

  it("names the audio stage once turns exist", () => {
    const withTurns = episode({
      turns: [{ id: "t1", speaker: "clementine", kind: "content", text: "Hello", citations: [] }],
    });
    expect(markStalledEpisode(withTurns).error).toContain("recording audio");
  });
});
