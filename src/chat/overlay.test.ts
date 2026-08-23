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
});
