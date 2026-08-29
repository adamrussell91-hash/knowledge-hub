import { describe, expect, it } from "vitest";
import { wheelIntent, wheelPanPixels } from "./gestures";

describe("timeline wheel", () => {
  it("lets a normal vertical wheel scroll the page", () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: false, shiftKey: false, deltaX: 0, deltaY: 80 })).toBe("scroll");
  });

  it("zooms only with ctrl or cmd", () => {
    expect(wheelIntent({ ctrlKey: true, metaKey: false, shiftKey: false, deltaX: 0, deltaY: -40 })).toBe("zoom");
    expect(wheelIntent({ ctrlKey: false, metaKey: true, shiftKey: false, deltaX: 0, deltaY: 40 })).toBe("zoom");
  });

  it("pans on a horizontal trackpad swipe or shift+wheel", () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: false, shiftKey: false, deltaX: 60, deltaY: 8 })).toBe("pan");
    expect(wheelIntent({ ctrlKey: false, metaKey: false, shiftKey: true, deltaX: 0, deltaY: 40 })).toBe("pan");
    expect(wheelPanPixels({ shiftKey: true, deltaX: 0, deltaY: 40 })).toBe(40);
  });
});
