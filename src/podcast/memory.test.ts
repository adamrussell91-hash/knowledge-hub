import { describe, expect, it } from "vitest";
import { pickMemories } from "./memory";

describe("pickMemories", () => {
  it("returns all matching series episodes in chronological order", () => {
    const episodes = [
      { seriesId: "sdt", memory: "episode 3", created_at: "2026-08-03T00:00:00.000Z" },
      { seriesId: "sdt", memory: "episode 1", created_at: "2026-08-01T00:00:00.000Z" },
      { seriesId: "sdt", memory: "episode 2", created_at: "2026-08-02T00:00:00.000Z" },
      { seriesId: "sdt", memory: "episode 4", created_at: "2026-08-04T00:00:00.000Z" },
    ];
    expect(pickMemories({ seriesId: "sdt", episodes })).toEqual([
      "episode 1",
      "episode 2",
      "episode 3",
      "episode 4",
    ]);
  });

  it("returns at most three one-off memories, newest first, with overlapping tags", () => {
    const episodes = [
      { scope: { tags: ["sdt"] }, memory: "oldest", created_at: "2026-08-01T00:00:00.000Z" },
      { scope: { tags: ["dmgt"] }, memory: "other tag", created_at: "2026-08-02T00:00:00.000Z" },
      { scope: { tags: ["sdt", "motivation"] }, memory: "middle", created_at: "2026-08-03T00:00:00.000Z" },
      { scope: { tags: ["sdt"] }, memory: "newest", created_at: "2026-08-04T00:00:00.000Z" },
      { scope: { tags: ["sdt"] }, memory: "fourth", created_at: "2026-08-05T00:00:00.000Z" },
    ];
    expect(pickMemories({ scopeTags: ["sdt"], episodes })).toEqual(["fourth", "newest", "middle"]);
  });

  it("skips empty memory strings", () => {
    const episodes = [
      { scope: { tags: ["sdt"] }, memory: "   ", created_at: "2026-08-01T00:00:00.000Z" },
      { scope: { tags: ["sdt"] }, memory: "", created_at: "2026-08-02T00:00:00.000Z" },
      { scope: { tags: ["sdt"] }, memory: "kept", created_at: "2026-08-03T00:00:00.000Z" },
    ];
    expect(pickMemories({ scopeTags: ["sdt"], episodes })).toEqual(["kept"]);
  });

  it("does not mix one-off episodes into a series pick", () => {
    const episodes = [
      { seriesId: "sdt", memory: "series one", created_at: "2026-08-01T00:00:00.000Z" },
      { scope: { tags: ["sdt"] }, memory: "one-off", created_at: "2026-08-02T00:00:00.000Z" },
      { seriesId: "sdt", memory: "series two", created_at: "2026-08-03T00:00:00.000Z" },
    ];
    expect(pickMemories({ seriesId: "sdt", episodes })).toEqual(["series one", "series two"]);
  });
});
