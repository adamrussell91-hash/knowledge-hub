/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { enterWikiRail, renderWikiRail } from "./rail";

vi.mock("../api/wikiClient", async () => {
  const actual = await vi.importActual<typeof import("../api/wikiClient")>("../api/wikiClient");
  return {
    ...actual,
    USE_LOCAL_DATA: false,
    listCuratorPending: vi.fn().mockResolvedValue([
      {
        id: "a||b",
        noteA: "a",
        noteB: "b",
        titleA: "Duty",
        titleB: "Heaney",
        excerptA: "inherited",
        excerptB: "the poem",
        relation: "related",
        rationale: "same thread",
        proposedAt: "2026-08-15T00:00:00.000Z",
      },
    ]),
    curatorAction: vi.fn(),
  };
});

describe("renderWikiRail", () => {
  beforeEach(() => {
    enterWikiRail();
  });

  it("renders the review queue chrome and loads pending cards", async () => {
    const app = document.createElement("div");
    document.body.appendChild(app);
    const host = {
      app,
      shell: (main: string) => {
        app.innerHTML = main;
      },
      render: vi.fn(),
    };
    renderWikiRail(host);
    expect(app.innerHTML).toContain("Wiki");
    expect(app.innerHTML).toContain("Run now");
    await vi.waitFor(() => expect(host.render).toHaveBeenCalled());
    renderWikiRail(host);
    expect(app.innerHTML).toContain("Duty");
    expect(app.innerHTML).toContain("Approve");
    expect(app.innerHTML).toContain("Dismiss");
  });
});
