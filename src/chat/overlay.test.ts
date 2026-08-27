/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChat, savePage } from "../api/client";
import { ensureChatOverlay, hideChatOverlay, openChatOverlay } from "./overlay";

vi.mock("../api/client", () => ({
  USE_LOCAL_DATA: false,
  ChatWriteDroppedError: class ChatWriteDroppedError extends Error {},
  getPage: vi.fn(),
  runChat: vi.fn(),
  savePage: vi.fn(),
  tidyPage: vi.fn(),
}));

const runChatMock = vi.mocked(runChat);
const savePageMock = vi.mocked(savePage);

describe("chat overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("uses a chat icon on the FAB and portraits in the picker", () => {
    ensureChatOverlay({ visible: true });
    const fab = document.querySelector<HTMLButtonElement>(".floating-chat-button")!;
    expect(fab).toBeTruthy();
    expect(fab.querySelector("svg")).toBeTruthy();
    expect(fab.querySelector("img")).toBeNull();
    fab.click();
    const portraits = [...document.querySelectorAll<HTMLImageElement>(".agent-picker__avatar img")].map(img => img.getAttribute("src"));
    expect(portraits).toEqual(["/assets/agents/clementine.png", "/assets/agents/ann.png"]);
    expect(document.querySelector(".chat-overlay")).toBeTruthy();
  });

  it("renders protocol bubbles for the active agent", () => {
    ensureChatOverlay({ visible: true });
    openChatOverlay();
    expect(document.body.textContent).toContain("Clementine can");
    expect(document.querySelector('[data-protocol="fromBook"]')).toBeTruthy();
    expect(document.querySelector('[data-protocol="synthesis"]')).toBeTruthy();
    expect(document.querySelector('[data-protocol="evidence"]')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('[data-personality="ann"]')!.click();
    expect(document.body.textContent).toContain("Ann can");
    expect(document.querySelector('[data-protocol="close-read"]')).toBeTruthy();
    expect(document.querySelector('[data-protocol="synthesis"]')).toBeNull();
  });

  it("pins a graph note as a chip and hides on sign-in", () => {
    ensureChatOverlay({ visible: true });
    openChatOverlay({ note: { pageId: "p1", title: "Retrieval practice and spacing" } });
    expect(document.body.textContent).toContain("Retrieval practice and spacing");
    hideChatOverlay();
    expect(document.querySelector(".floating-chat-button")).toBeNull();
  });

  it("turns a raw page id in the reply into a live note link", () => {
    const pageId = "page_notion_1aaf794f84768020a2aec3db6939dedc";
    const opened: string[] = [];
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
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
    ensureChatOverlay({
      visible: true,
      onOpenPage: id => {
        opened.push(id);
      },
    });
    const link = document.querySelector<HTMLAnchorElement>(".note-link");
    expect(link?.textContent).toBe("Gagné DMGT 2.0");
    expect(link?.dataset.openPage).toBe(pageId);
    expect(document.body.textContent).not.toContain(pageId);
    link?.click();
    expect(opened).toEqual([pageId]);
  });

  it("rewrites a mistyped citation id to the real archive note", () => {
    const realId = "page_notion_ac75845b67ab4b91b110a416d8eca9bb";
    const mistyped = "page_notion_ac75845b67ab4b91b110a416d8aca9bb";
    const opened: string[] = [];
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          {
            role: "assistant",
            content: `[Four quarters marking](${mistyped}) captures Wiliam's position.`,
          },
        ],
      }),
    );
    ensureChatOverlay({
      visible: true,
      archiveNotes: [{ pageId: realId, title: "Four quarters marking" }],
      onOpenPage: id => {
        opened.push(id);
      },
    });
    const link = document.querySelector<HTMLAnchorElement>(".note-link");
    expect(link?.dataset.openPage).toBe(realId);
    expect(document.body.textContent).not.toContain(mistyped);
    link?.click();
    expect(opened).toEqual([realId]);
  });

  it("starts a new overlay sitting from New chat", () => {
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          { role: "user", content: "How do these notes connect?" },
          { role: "assistant", content: "They share a retrieval thread." },
        ],
        notes: [{ pageId: "p1", title: "Retrieval practice" }],
      }),
    );
    ensureChatOverlay({ visible: true });
    expect(document.body.textContent).toContain("How do these notes connect?");
    expect(document.body.textContent).toContain("Retrieval practice");
    document.querySelector<HTMLButtonElement>("[data-new-chat]")!.click();
    expect(document.body.textContent).not.toContain("How do these notes connect?");
    expect(document.body.textContent).not.toContain("They share a retrieval thread.");
    expect(document.body.textContent).not.toContain("Retrieval practice");
    expect(document.querySelector("[data-new-chat]")).toBeTruthy();
  });

  it("uses a textarea composer and offers save on a developed reply", () => {
    sessionStorage.setItem(
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        open: true,
        input: "",
        turns: [
          {
            role: "assistant",
            content: `## Desirable difficulties

Effortful retrieval is the load-bearing claim. The archive supports Bjork here and turns that back onto the book. The notes that earn a citation are the ones that change what a careful reader would believe.`,
          },
        ],
      }),
    );
    ensureChatOverlay({ visible: true });
    expect(document.querySelector("textarea#overlay-chat-input")).toBeTruthy();
    expect(document.querySelector("[data-save-brief]")?.textContent).toBe("Save as new page");
  });

  it("asks for the book before researching a From a book sitting", () => {
    ensureChatOverlay({
      visible: true,
      bookLabels: ["Make It Stick"],
    });
    openChatOverlay({ protocolId: "fromBook" });
    expect(document.body.textContent).toContain("The one in your hand");
    expect(document.body.textContent).toContain("From the page");
    expect(document.querySelector<HTMLButtonElement>("[type=submit]")?.textContent).toBe("Research this");
    const field = document.querySelector<HTMLTextAreaElement>("#overlay-chat-input")!;
    field.value = "desirable difficulties";
    field.dispatchEvent(new Event("input"));
    document.querySelector<HTMLFormElement>(".chat-form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(document.body.textContent).toContain("Pick the book first.");
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("keeps the overlay book after Use this book", () => {
    ensureChatOverlay({
      visible: true,
      bookLabels: ["Make It Stick"],
    });
    openChatOverlay({ protocolId: "fromBook" });
    const field = document.querySelector<HTMLInputElement>("#overlay-chat-book")!;
    field.value = "Make It Stick";
    field.dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>("[data-set-book]")!.click();
    expect(document.body.textContent).toContain("Reading: Make It Stick");
    expect(document.querySelector("#overlay-chat-locus")).toBeTruthy();
    expect(document.querySelector("[data-set-book]")).toBeNull();
  });

  it("files a researched overlay page under the book", async () => {
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
      "knowledge-hub-overlay-chat-v1",
      JSON.stringify({
        personality: "clementine",
        selectedProtocolId: "fromBook",
        bookContext: { label: "Make It Stick", locus: "p. 142" },
        open: true,
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
    ensureChatOverlay({ visible: true, bookLabels: ["Make It Stick"] });
    expect(document.body.textContent).toContain("Reading: Make It Stick (p. 142)");
    expect(document.body.textContent).toContain("Add to archive");
    expect(document.body.textContent).toContain("stamped under Make It Stick");
    document.querySelector<HTMLButtonElement>("[data-save-brief]")!.click();
    await vi.waitFor(() => expect(savePageMock).toHaveBeenCalled());
    expect(savePageMock.mock.calls[0]?.[0]?.origins).toEqual([{ kind: "book", label: "Make It Stick" }]);
  });
});
