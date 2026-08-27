/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("bindKeyboardInset", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--keyboard-inset");
  });

  it("writes the covered viewport height onto the document", async () => {
    const listeners: Array<() => void> = [];
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 20,
      addEventListener: (_name: string, handler: () => void) => {
        listeners.push(handler);
      },
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const { bindKeyboardInset } = await import("./keyboardInset");
    bindKeyboardInset();
    expect(document.documentElement.style.getPropertyValue("--keyboard-inset")).toBe("280px");
    expect(listeners).toHaveLength(2);
  });
});
