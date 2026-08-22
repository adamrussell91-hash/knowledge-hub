import { describe, expect, it } from "vitest";
import { topicQuery } from "./topicQuery";

describe("topicQuery", () => {
  it("keeps the topic from a scoping question", () => {
    expect(topicQuery("what do I have on attribution theory")).toBe("attribution theory");
    expect(topicQuery("What do I have on Gagne?")).toBe("Gagne");
  });

  it("leaves a plain topic alone", () => {
    expect(topicQuery("Synthesise Gagne")).toBe("Synthesise Gagne");
  });
});
