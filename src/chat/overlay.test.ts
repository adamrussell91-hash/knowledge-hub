/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { ensureChatOverlay, hideChatOverlay, openChatOverlay } from "./overlay";

describe("chat overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("uses personality portraits on the FAB and the picker", () => {
    ensureChatOverlay({ visible: true });
    const fab = document.querySelector<HTMLButtonElement>(".floating-chat-button")!;
    expect(fab).toBeTruthy();
    expect(fab.querySelector("img")?.getAttribute("src")).toBe("/assets/agents/clementine.png");
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
