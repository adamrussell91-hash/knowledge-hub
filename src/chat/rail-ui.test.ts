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
    expect(hats).toHaveLength(7);
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
});
