import { describe, expect, it } from "vitest";
import { CHAT_HATS, hatById, resolveChatPlan } from "./hats";

describe("chat hats", () => {
  it("ships eight hats including From a book and no Consolidation", () => {
    expect(CHAT_HATS.map(hat => hat.id)).toEqual([
      "fromBook",
      "scoping",
      "synthesis",
      "evidence",
      "contested",
      "internalExternal",
      "methods",
      "writing",
    ]);
    expect(CHAT_HATS.some(hat => /consolidat/i.test(hat.label))).toBe(false);
    for (const hat of CHAT_HATS) {
      expect(hat.explain).toMatch(/^[A-Z][^.?!]*[.?!]$/);
    }
  });

  it("uses cheap defaults and lets discrete dials override them", () => {
    expect(resolveChatPlan("scoping")).toMatchObject({
      hat: hatById("scoping"),
      scope: "wide",
      depth: "single",
      kernel: "quick",
      k: 32,
      maxRounds: 1,
      negation: false,
    });
    expect(resolveChatPlan("evidence")).toMatchObject({
      scope: "narrow",
      depth: "verified",
      kernel: "deep",
      k: 8,
      maxRounds: 2,
      negation: true,
    });
    expect(resolveChatPlan("synthesis")).toMatchObject({
      scope: "standard",
      depth: "iterative",
      kernel: "deep",
      maxRounds: 5,
    });
    expect(resolveChatPlan("methods")).toMatchObject({
      tags: ["Research Methods and Evidence Literacy"],
      kernel: "quick",
    });
    expect(resolveChatPlan("writing", { scope: "wide", depth: "exhaustive" })).toMatchObject({
      scope: "wide",
      depth: "exhaustive",
      kernel: "deep",
      k: 48,
      maxRounds: 5,
    });
    expect(hatById("writing").plan).toMatch(/answer it from the archive/i);
    expect(hatById("writing").plan).not.toMatch(/University writing-coach/i);
    expect(hatById("synthesis").plan).toMatch(/\[Title\]\(pageId\)/);
    expect(hatById("synthesis").plan).toMatch(/central claim/i);
    expect(hatById("synthesis").plan).toMatch(/explanatory levels/i);
    expect(hatById("synthesis").plan).not.toMatch(/archive page id/i);
    expect(hatById("synthesis").explain).toMatch(/audit trail/);
    expect(resolveChatPlan("fromBook")).toMatchObject({
      scope: "standard",
      depth: "iterative",
      kernel: "deep",
      k: 16,
      maxRounds: 5,
    });
    expect(hatById("fromBook").plan).toMatch(/bears on the book/i);
    expect(hatById("fromBook").plan).toMatch(/strongest notes/i);
  });
});
