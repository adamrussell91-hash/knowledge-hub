/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { ensureChatOverlay, hideChatOverlay, openChatOverlay } from "./overlay";

describe("chat overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
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
});
