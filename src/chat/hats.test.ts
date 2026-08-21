import { describe, expect, it } from "vitest";
import { CHAT_HATS, hatById, resolveChatPlan } from "./hats";

describe("chat hats", () => {
  it("ships seven hats and no Consolidation", () => {
    expect(CHAT_HATS.map(hat => hat.id)).toEqual([
      "scoping",
      "synthesis",
      "evidence",
      "contested",
      "internalExternal",
      "methods",
      "writing",
    ]);
    expect(CHAT_HATS.some(hat => /consolidat/i.test(hat.label))).toBe(false);
  });

  it("uses cheap defaults and lets discrete dials override them", () => {
    expect(resolveChatPlan("scoping")).toEqual({
      hat: hatById("scoping"),
      scope: "wide",
      depth: "single",
      kernel: "quick",
    });
    expect(resolveChatPlan("evidence")).toMatchObject({ scope: "narrow", depth: "verified", kernel: "quick" });
    expect(resolveChatPlan("synthesis", { depth: "iterative" })).toMatchObject({
      scope: "standard",
      depth: "iterative",
      kernel: "deep",
    });
    expect(resolveChatPlan("writing", { scope: "wide", depth: "exhaustive" })).toMatchObject({
      scope: "wide",
      depth: "exhaustive",
      kernel: "deep",
    });
  });
});
