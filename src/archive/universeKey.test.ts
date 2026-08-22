/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { bindUniverseKey, setUniverseKeyOpen, UNIVERSE_KEY_ITEMS, universeKeyHtml } from "./universeKey";

describe("universe key language", () => {
  it("explains every hover kind plus the giant and ring decorations", () => {
    const ids = UNIVERSE_KEY_ITEMS.map(item => item.id);
    expect(ids).toEqual(["sun", "planet", "giant", "ringed", "minor", "moon", "page", "rock"]);
  });

  it("says a rock is an untagged note and a planet is a major topic", () => {
    const byId = Object.fromEntries(UNIVERSE_KEY_ITEMS.map(item => [item.id, item]));
    expect(byId.rock?.meaning.toLowerCase()).toMatch(/no topic tags|untagged/);
    expect(byId.planet?.meaning.toLowerCase()).toMatch(/major topic/);
    expect(byId.giant?.meaning.toLowerCase()).toMatch(/most connected|largest/);
    expect(byId.sun?.meaning.toLowerCase()).toMatch(/not a note/);
    expect(byId.minor?.title).toBe("Minor planet");
    expect(byId.page?.title).toBe("Note");
  });
});

describe("universeKeyHtml", () => {
  it("renders a collapsed glass key by default", () => {
    document.body.innerHTML = universeKeyHtml(false);
    const key = document.querySelector<HTMLElement>("[data-universe-key]")!;
    const toggle = document.querySelector<HTMLButtonElement>("[data-universe-key-toggle]")!;
    expect(key.classList.contains("glass-panel")).toBe(true);
    expect(key.classList.contains("is-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Universe key");
    expect(toggle.querySelector("svg")).toBeTruthy();
    expect(toggle.querySelector("ellipse")).toBeTruthy();
    expect(toggle.querySelectorAll("circle").length).toBe(2);
    for (const item of UNIVERSE_KEY_ITEMS) {
      expect(key.textContent).toContain(item.title);
      expect(key.textContent).toContain(item.meaning);
    }
  });

  it("can start expanded so a remount keeps the open card", () => {
    document.body.innerHTML = universeKeyHtml(true);
    const key = document.querySelector<HTMLElement>("[data-universe-key]")!;
    const toggle = document.querySelector<HTMLButtonElement>("[data-universe-key-toggle]")!;
    expect(key.classList.contains("is-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Collapse universe key");
  });
});

describe("bindUniverseKey", () => {
  it("expands and collapses without touching anything else in the host", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="graph-stage"><canvas class="graph-canvas"></canvas></div>${universeKeyHtml(false)}`;
    const onToggle = vi.fn();
    bindUniverseKey(host, onToggle);

    const key = host.querySelector<HTMLElement>("[data-universe-key]")!;
    const toggle = host.querySelector<HTMLButtonElement>("[data-universe-key-toggle]")!;
    toggle.click();
    expect(key.classList.contains("is-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(host.querySelector(".graph-canvas")).toBeTruthy();

    toggle.click();
    expect(key.classList.contains("is-open")).toBe(false);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and restores focus to the icon", () => {
    const host = document.createElement("div");
    host.innerHTML = universeKeyHtml(true);
    document.body.append(host);
    const onToggle = vi.fn();
    bindUniverseKey(host, onToggle);
    const key = host.querySelector<HTMLElement>("[data-universe-key]")!;
    const toggle = host.querySelector<HTMLButtonElement>("[data-universe-key-toggle]")!;

    key.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(key.classList.contains("is-open")).toBe(false);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(toggle);
    host.remove();
  });

  it("is a no-op when the key is not in the tree", () => {
    expect(() => bindUniverseKey(document.createElement("div"), vi.fn())).not.toThrow();
  });
});

describe("setUniverseKeyOpen", () => {
  it("syncs the open class and button labels", () => {
    document.body.innerHTML = universeKeyHtml(false);
    const key = document.querySelector<HTMLElement>("[data-universe-key]")!;
    setUniverseKeyOpen(key, true);
    expect(key.classList.contains("is-open")).toBe(true);
    expect(key.querySelector("[data-universe-key-toggle]")!.getAttribute("aria-expanded")).toBe("true");
  });
});
