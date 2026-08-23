import { describe, expect, it } from "vitest";
import { CHAT_PERSONALITIES, isChatPersonalityId, pinOverlayNote } from "./personalities";

describe("chat personalities", () => {
  it("uses the Teaching Hub portraits, not initials", () => {
    expect(CHAT_PERSONALITIES.map(item => item.id)).toEqual(["clementine", "ann"]);
    expect(CHAT_PERSONALITIES[0]?.avatarSrc).toBe("/assets/agents/clementine.png");
    expect(CHAT_PERSONALITIES[1]?.avatarSrc).toBe("/assets/agents/ann.png");
    expect(isChatPersonalityId("clementine")).toBe(true);
    expect(isChatPersonalityId("clare")).toBe(false);
  });

  it("pins at most two notes and moves a repeat to the end", () => {
    const a = { pageId: "a", title: "A" };
    const b = { pageId: "b", title: "B" };
    const c = { pageId: "c", title: "C" };
    expect(pinOverlayNote([a, b], c)).toEqual([b, c]);
    expect(pinOverlayNote([a, b], a)).toEqual([b, a]);
  });
});
