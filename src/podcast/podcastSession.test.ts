import { describe, expect, it, vi } from "vitest";
import { PodcastEpisodeSchema } from "./schema";
import { runningEpisodeStub } from "./start";
import { parseEpisodeCommission } from "./kernel";
import { PodcastSession } from "../../worker/src/podcastSession";

function mockState() {
  const store = new Map<string, unknown>();
  let alarm: number | undefined;
  return {
    store,
    alarm: () => alarm,
    ctx: {
      storage: {
        get: async <T>(key: string) => store.get(key) as T | undefined,
        put: async (key: string, value: unknown) => {
          store.set(key, value);
        },
        setAlarm: async (scheduledTime: number | Date) => {
          alarm = typeof scheduledTime === "number" ? scheduledTime : scheduledTime.getTime();
        },
        deleteAlarm: async () => {
          alarm = undefined;
        },
      },
    } as DurableObjectState,
  };
}

describe("PodcastSession /start", () => {
  it("returns a running stub and does not generate in the same tick", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { ctx, alarm } = mockState();
    const session = new PodcastSession(ctx, {
      ARCHIVE: { get: async () => null, put: async () => undefined },
      ANTHROPIC_API_KEY: "test-key",
    });
    const commission = parseEpisodeCommission({ mode: "recap" });
    const episode = runningEpisodeStub({
      id: "ep_do",
      created_at: "2026-08-15T00:00:00.000Z",
      commission,
    });

    const response = await session.fetch(
      new Request("https://session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode, commission }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "ep_do", status: "running", turns: [] });
    expect(PodcastEpisodeSchema.parse(episode).turns).toEqual([]);
    expect(alarm()).toBeTypeOf("number");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
