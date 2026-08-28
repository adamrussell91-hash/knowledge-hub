/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChat } from "../api/client";
import { enterChatRail, renderChatRail, type ChatRailHost } from "./rail";

vi.mock("../api/client", () => ({
  USE_LOCAL_DATA: false,
  ChatWriteDroppedError: class ChatWriteDroppedError extends Error {},
  runChat: vi.fn(),
  savePage: vi.fn(),
  tidyPage: vi.fn(),
}));

const runChatMock = vi.mocked(runChat);

function makeHost(): ChatRailHost {
  const app = document.createElement("main");
  document.body.append(app);
  const host: ChatRailHost = {
    app,
    shell(main) {
      app.innerHTML = main;
    },
    render() {
      renderChatRail(host);
    },
    pageHeader: (eyebrow, title, extra = "") => `<header><p>${eyebrow}</p><h1>${title}</h1>${extra}</header>`,
  };
  return host;
}

describe("Knowledge chat rail protocol affordances", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
    enterChatRail({ fresh: true });
  });

  it("renders a one-sentence hover card on every existing hat", () => {
    const host = makeHost();
    host.render();

    const hats = [...host.app.querySelectorAll<HTMLButtonElement>("[data-hat]")];
    expect(hats).toHaveLength(8);
    for (const hat of hats) {
      const tip = hat.querySelector<HTMLElement>(".agent-protocol-pills__tip");
      expect(tip?.getAttribute("role")).toBe("tooltip");
      expect(tip?.textContent).toMatch(/^[A-Z][^.?!]*[.?!]$/);
      expect(hat.getAttribute("aria-describedby")).toBe(tip?.id);
      expect(hat.getAttribute("title")).toBeNull();
    }
  });

  it("rotates one Clementine wait line and clears it when the reply arrives", async () => {
    let phase: ((value: { status: "writing"; research?: undefined }) => void) | undefined;
    let finish: ((value: { status: "done"; reply: string }) => void) | undefined;
    runChatMock.mockImplementation((_input, onPhase) => {
      phase = onPhase as typeof phase;
      return new Promise((resolve) => { finish = resolve; });
    });
    const host = makeHost();
    host.render();
    const field = host.app.querySelector<HTMLTextAreaElement>("#chat-input")!;
    field.value = "What does the archive say?";
    host.app.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(host.app.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe(
        "Checking the archive shelves…",
      );
    });
    expect(host.app.querySelectorAll(".chat__status")).toHaveLength(1);
    expect(host.app.textContent).not.toContain("Still working…");

    phase?.({ status: "writing" });
    await vi.waitFor(() => {
      expect(host.app.querySelector(".chat__status")?.textContent).toBe(
        "Finding the argument underneath…",
      );
    });

    finish?.({ status: "done", reply: "Here is the useful thread." });
    await vi.waitFor(() => expect(host.app.textContent).toContain("Here is the useful thread."));
    expect(host.app.querySelector(".chat__status")).toBeNull();
  });

  it("turns a raw page id in the reply into a live note link", () => {
    const pageId = "page_notion_1aaf794f84768020a2aec3db6939dedc";
    const opened: string[] = [];
    sessionStorage.setItem(
      "knowledge-hub-chat-v1",
      JSON.stringify({
        hat: "synthesis",
        input: "",
        turns: [
          {
            role: "assistant",
            content: `Motivation is a catalyst (${pageId}).`,
            findings: [{ pageId, title: "Gagné DMGT 2.0", excerpt: "catalyst", stance: "supports", analysis: "" }],
          },
        ],
      }),
    );
    const host = makeHost();
    host.onOpenPage = id => {
      opened.push(id);
    };
    host.render();
    const link = host.app.querySelector<HTMLAnchorElement>(".note-link");
    expect(link?.textContent).toBe("Gagné DMGT 2.0");
    expect(link?.dataset.openPage).toBe(pageId);
    expect(host.app.textContent).not.toContain(pageId);
    link?.click();
    expect(opened).toEqual([pageId]);
  });

  it("rewrites a mistyped citation id to the real archive note", () => {
    const realId = "page_notion_ac75845b67ab4b91b110a416d8eca9bb";
    const mistyped = "page_notion_ac75845b67ab4b91b110a416d8aca9bb";
    const opened: string[] = [];
    sessionStorage.setItem(
      "knowledge-hub-chat-v1",
      JSON.stringify({
        hat: "synthesis",
        input: "",
        turns: [
          {
            role: "assistant",
            content: `[Four quarters marking](${mistyped}) captures Wiliam's position.`,
          },
        ],
      }),
    );
    const host = makeHost();
    host.archiveNotes = [{ pageId: realId, title: "Four quarters marking" }];
    host.onOpenPage = id => {
      opened.push(id);
    };
    host.render();
    const link = host.app.querySelector<HTMLAnchorElement>(".note-link");
    expect(link?.dataset.openPage).toBe(realId);
    expect(host.app.textContent).not.toContain(mistyped);
    link?.click();
    expect(opened).toEqual([realId]);
  });

  it("starts a new sitting from New chat", () => {
    sessionStorage.setItem(
      "knowledge-hub-chat-v1",
      JSON.stringify({
        hat: "scoping",
        input: "",
        turns: [
          { role: "user", content: "What connects these notes?" },
          { role: "assistant", content: "A shared retrieval thread." },
        ],
        noteContext: { pageId: "p1", title: "Retrieval practice" },
      }),
    );
    const host = makeHost();
    host.render();
    expect(host.app.textContent).toContain("A shared retrieval thread.");
    expect(host.app.textContent).toContain("Retrieval practice");
    host.app.querySelector<HTMLButtonElement>("[data-new-chat]")!.click();
    expect(host.app.textContent).not.toContain("A shared retrieval thread.");
    expect(host.app.textContent).not.toContain("Retrieval practice");
    expect(host.app.querySelector("[data-new-chat]")).toBeTruthy();
  });

  it("opens the portrait visualiser from Chat", () => {
    const opened: string[] = [];
    const host = makeHost();
    host.onOpenVisualiser = () => opened.push("visualiser");
    host.render();
    host.app.querySelector<HTMLButtonElement>("[data-open-visualiser]")!.click();
    expect(opened).toEqual(["visualiser"]);
  });

  it("asks for the book before making a from-a-book note", () => {
    enterChatRail({ fresh: true, hat: "fromBook" });
    const host = makeHost();
    host.bookLabels = ["Make It Stick"];
    host.render();
    expect(host.app.textContent).toContain("From a book");
    expect(host.app.textContent).toContain("The one in your hand");
    expect(host.app.querySelector(".chat--from-book")).toBeTruthy();
    expect(host.app.querySelector(".chat__composer")).toBeNull();
    expect(host.app.querySelector<HTMLButtonElement>("[type=submit]")?.textContent).toBe("Make note");
    const field = host.app.querySelector<HTMLTextAreaElement>("#chat-input")!;
    field.value = "desirable difficulties";
    host.app.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(host.app.textContent).toContain("Pick the book first.");
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("does not leave a duplicate You turn when Make note fails", async () => {
    runChatMock.mockRejectedValueOnce(new Error("hat and messages are required"));
    sessionStorage.setItem(
      "knowledge-hub-chat-v1",
      JSON.stringify({
        hat: "fromBook",
        bookContext: {
          label: "The Origins of Political Order: From Prehuman Times to the French Revolution",
          locus: "P145",
        },
        input: "Economists and the rule of law",
        turns: [],
      }),
    );
    const host = makeHost();
    host.render();
    host.app.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(runChatMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(host.app.textContent).toContain("hat and messages are required"));
    const youCards = [...host.app.querySelectorAll(".coach-msg")].filter(el =>
      el.textContent?.includes("You"),
    );
    expect(youCards).toHaveLength(0);
    expect(host.app.querySelector<HTMLTextAreaElement>("#chat-input")?.value).toBe(
      "Economists and the rule of law",
    );
  });

  it("files the researched page after Make note without a second confirm tap", async () => {
    const { savePage, tidyPage } = await import("../api/client");
    const savePageMock = vi.mocked(savePage);
    const tidyPageMock = vi.mocked(tidyPage);
    savePageMock.mockResolvedValue({
      id: "page_hub_saved",
      title: "Economists and the rule of law",
      area: "notes",
      tags: [],
      origins: [{ kind: "book", label: "Make It Stick" }],
      body: "x",
      connected: [],
      attachments: [],
      source: "hub",
      created_at: "2026-08-27T00:00:00.000Z",
      updated_at: "2026-08-27T00:00:00.000Z",
      schema_version: 1,
    });
    tidyPageMock.mockResolvedValue(undefined as never);
    const reply = `## Economists and the rule of law

Effortful retrieval is the load-bearing claim. The archive supports Bjork here and turns that back onto Make It Stick. The notes that earn a citation are the ones that change what a careful reader would believe about institutions.`;
    runChatMock.mockResolvedValue({ status: "done", reply });
    sessionStorage.setItem(
      "knowledge-hub-chat-v1",
      JSON.stringify({
        hat: "fromBook",
        bookContext: { label: "Make It Stick", locus: "p. 142" },
        input: "Economists and the rule of law",
        turns: [],
      }),
    );
    const host = makeHost();
    host.render();
    expect(host.app.querySelector("[type=submit]")?.textContent).toBe("Make note");
    host.app.querySelector<HTMLFormElement>("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(runChatMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(savePageMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(host.app.textContent).not.toContain("Add to archive"));
    await vi.waitFor(() => expect(host.app.textContent).not.toContain("Filing under"));
    expect(savePageMock.mock.calls[0]?.[0]?.origins).toEqual([{ kind: "book", label: "Make It Stick" }]);
    expect(tidyPageMock).toHaveBeenCalled();
    expect(host.app.textContent).toContain("Economists and the rule of law");
  });

  it("files a researched page under the book with a confirm card", async () => {
    const { savePage } = await import("../api/client");
    const savePageMock = vi.mocked(savePage);
    savePageMock.mockResolvedValue({
      id: "page_hub_saved",
      title: "Desirable difficulties",
      area: "notes",
      tags: [],
      origins: [{ kind: "book", label: "Make It Stick" }],
      body: "x",
      connected: [],
      attachments: [],
      source: "hub",
      created_at: "2026-08-27T00:00:00.000Z",
      updated_at: "2026-08-27T00:00:00.000Z",
      schema_version: 1,
    });
    sessionStorage.setItem(
      "knowledge-hub-chat-v1",
      JSON.stringify({
        hat: "fromBook",
        bookContext: { label: "Make It Stick", locus: "p. 142" },
        input: "",
        turns: [
          { role: "user", content: "desirable difficulties" },
          {
            role: "assistant",
            content: `## Desirable difficulties

Effortful retrieval is the load-bearing claim. The archive supports Bjork here and turns that back onto Make It Stick. The notes that earn a citation are the ones that change what a careful reader would believe.`,
          },
        ],
      }),
    );
    const host = makeHost();
    host.render();
    expect(host.app.textContent).toContain("Reading: Make It Stick (p. 142)");
    expect(host.app.textContent).toContain("Add to archive");
    expect(host.app.textContent).toContain("stamped under Make It Stick");
    host.app.querySelector<HTMLButtonElement>("[data-save-brief]")!.click();
    await vi.waitFor(() => expect(savePageMock).toHaveBeenCalled());
    expect(savePageMock.mock.calls[0]?.[0]?.origins).toEqual([{ kind: "book", label: "Make It Stick" }]);
  });
});
