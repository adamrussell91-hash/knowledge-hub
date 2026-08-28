/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  UNIVERSE_DARK_KEY,
  applyUniverseViewState,
  bindUniverseView,
  readUniverseDark,
  shouldExitUniverseFullscreen,
  syncUniverseViewButtons,
  universeExitHtml,
  universeViewToolsHtml,
  universeWrapClass,
  writeUniverseDark,
  graphFullscreenToolsHtml,
} from "./universeChrome";

describe("universe view chrome", () => {
  it("keeps the default wrap class identical to today's light inset graph", () => {
    expect(universeWrapClass(false, false)).toBe("graph-wrap");
    expect(universeWrapClass(true, false)).toBe("graph-wrap is-universe-dark");
    expect(universeWrapClass(false, true)).toBe("graph-wrap is-universe-fullscreen");
    expect(universeWrapClass(true, true)).toBe("graph-wrap is-universe-dark is-universe-fullscreen");
  });

  it("gives constellation a Full screen toggle without the Universe dark control", () => {
    document.body.innerHTML = graphFullscreenToolsHtml(false) + universeExitHtml(false);
    expect(document.querySelector("[data-universe-dark]")).toBeNull();
    const full = document.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!;
    expect(full.textContent).toBe("Full screen");
    expect(full.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector<HTMLButtonElement>("[data-universe-exit]")!.hidden).toBe(true);
    document.body.innerHTML = graphFullscreenToolsHtml(true) + universeExitHtml(true);
    expect(document.querySelector("[data-universe-fullscreen]")!.textContent).toBe("Exit");
    expect(document.querySelector<HTMLButtonElement>("[data-universe-exit]")!.hidden).toBe(false);
  });

  it("renders Dark and Full screen as unpressed toggles by default", () => {
    document.body.innerHTML = universeViewToolsHtml(false, false) + universeExitHtml(false);
    const dark = document.querySelector<HTMLButtonElement>("[data-universe-dark]")!;
    const full = document.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!;
    const exit = document.querySelector<HTMLButtonElement>("[data-universe-exit]")!;
    expect(dark.textContent).toBe("Dark");
    expect(dark.getAttribute("aria-pressed")).toBe("false");
    expect(dark.classList.contains("is-active")).toBe(false);
    expect(full.textContent).toBe("Full screen");
    expect(full.getAttribute("aria-pressed")).toBe("false");
    expect(exit.hidden).toBe(true);
  });

  it("labels the active modes so they stay exitable", () => {
    document.body.innerHTML = universeViewToolsHtml(true, true) + universeExitHtml(true);
    expect(document.querySelector("[data-universe-dark]")!.textContent).toBe("Light");
    expect(document.querySelector("[data-universe-fullscreen]")!.textContent).toBe("Exit");
    expect(document.querySelector<HTMLButtonElement>("[data-universe-exit]")!.hidden).toBe(false);
  });

  it("applies classes on the wrap without rewriting its children", () => {
    const wrap = document.createElement("div");
    wrap.className = "graph-wrap";
    wrap.innerHTML = `<canvas class="graph-canvas"></canvas>${universeViewToolsHtml(false, false)}${universeExitHtml(false)}`;
    const canvas = wrap.querySelector("canvas");
    applyUniverseViewState(wrap, document.body, true, true);
    expect(wrap.className).toBe("graph-wrap is-universe-dark is-universe-fullscreen");
    expect(document.body.classList.contains("is-universe-fullscreen")).toBe(true);
    expect(wrap.querySelector("canvas")).toBe(canvas);
    expect(wrap.querySelector("[data-universe-dark]")!.textContent).toBe("Light");
    applyUniverseViewState(wrap, document.body, false, false);
    expect(wrap.className).toBe("graph-wrap");
    expect(document.body.classList.contains("is-universe-fullscreen")).toBe(false);
  });

  it("toggles dark and fullscreen through the buttons without remounting", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="graph-wrap">${universeViewToolsHtml(false, false)}${universeExitHtml(false)}</div>`;
    const wrap = host.querySelector<HTMLElement>(".graph-wrap")!;
    let dark = false;
    let fullscreen = false;
    const setDark = vi.fn((on: boolean) => {
      dark = on;
      applyUniverseViewState(wrap, document.body, dark, fullscreen);
    });
    const setFullscreen = vi.fn((on: boolean) => {
      fullscreen = on;
      applyUniverseViewState(wrap, document.body, dark, fullscreen);
    });
    bindUniverseView(host, {
      getDark: () => dark,
      getFullscreen: () => fullscreen,
      setDark,
      setFullscreen,
    });
    host.querySelector<HTMLButtonElement>("[data-universe-dark]")!.click();
    expect(setDark).toHaveBeenCalledWith(true);
    expect(wrap.classList.contains("is-universe-dark")).toBe(true);
    host.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!.click();
    expect(setFullscreen).toHaveBeenCalledWith(true);
    host.querySelector<HTMLButtonElement>("[data-universe-exit]")!.click();
    expect(setFullscreen).toHaveBeenLastCalledWith(false);
    expect(wrap.classList.contains("is-universe-fullscreen")).toBe(false);
  });

  it("only treats Escape as an exit while fullscreen is on", () => {
    expect(shouldExitUniverseFullscreen("Escape", true)).toBe(true);
    expect(shouldExitUniverseFullscreen("Escape", false)).toBe(false);
    expect(shouldExitUniverseFullscreen("Enter", true)).toBe(false);
  });

  it("persists dark as an explicit opt-in, never by default", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    expect(readUniverseDark(storage)).toBe(false);
    writeUniverseDark(true, storage);
    expect(store.get(UNIVERSE_DARK_KEY)).toBe("1");
    expect(readUniverseDark(storage)).toBe(true);
    writeUniverseDark(false, storage);
    expect(readUniverseDark(storage)).toBe(false);
    expect(readUniverseDark(null)).toBe(false);
  });

  it("syncs button copy if the wrap already has the markup", () => {
    document.body.innerHTML = universeViewToolsHtml(false, false) + universeExitHtml(false);
    syncUniverseViewButtons(document.body, true, true);
    expect(document.querySelector("[data-universe-dark]")!.textContent).toBe("Light");
    expect(document.querySelector("[data-universe-fullscreen]")!.textContent).toBe("Exit");
    expect(document.querySelector<HTMLButtonElement>("[data-universe-exit]")!.hidden).toBe(false);
  });
});
