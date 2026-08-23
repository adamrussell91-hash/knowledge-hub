/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startPodcast } from "../api/client";
import * as podcastRail from "./rail";
import type { PodcastRailHost } from "./rail";

vi.mock("../api/client", () => ({
  PODCAST_NEEDS_NETLIFY: "Podcast needs Netlify",
  USE_LOCAL_DATA: false,
  getPodcast: vi.fn(),
  listPodcasts: vi.fn(async () => ({ episodes: [], series: [] })),
  nextPodcastEpisode: vi.fn(),
  startPodcast: vi.fn(),
  startPodcastSeries: vi.fn(),
}));

const startPodcastMock = vi.mocked(startPodcast);

function makeHost(): PodcastRailHost {
  const app = document.createElement("main");
  document.body.append(app);
  const host: PodcastRailHost = {
    app,
    tags: [],
    shell(main) {
      app.innerHTML = main;
    },
    render() {
      podcastRail.renderPodcastRail(host);
    },
  };
  return host;
}

describe("Ann podcast wait copy", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
    podcastRail.enterPodcastRail();
  });

  it("provides ten to twelve Knowledge-site Ann lines with no generic wait copy", () => {
    const lines = (podcastRail as unknown as { ANN_PODCAST_WAIT_LINES: string[] }).ANN_PODCAST_WAIT_LINES;
    expect(lines.length).toBeGreaterThanOrEqual(10);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.every((line) => line.endsWith("…"))).toBe(true);
    expect(lines.join(" ")).not.toMatch(/Thinking…|Still working…|Working…|recording…/);
  });

  it("shows Ann in voice while the podcast commission is waiting", async () => {
    startPodcastMock.mockImplementation(() => new Promise(() => undefined));
    const host = makeHost();
    host.render();
    host.app.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(host.app.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe(
        "Red-pencilling the script…",
      );
    });
    expect(host.app.textContent).not.toMatch(/Working…|recording…|writing the script…/);
  });
});
