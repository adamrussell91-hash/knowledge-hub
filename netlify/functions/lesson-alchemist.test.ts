import { describe, expect, it } from "vitest";
import { buildAlchemistPrompt, parseConnectionsJson } from "./lesson-alchemist";

describe("lesson alchemist", () => {
  it("asks for non-obvious ICM connections", () => {
    const prompt = buildAlchemistPrompt({
      lessonText: "French Revolution",
      retrieved: [{ pageId: "p", title: "Entropy", excerpt: "Thermodynamics" }],
    });
    expect(prompt).toContain("French Revolution");
    expect(prompt).toContain("Entropy");
    expect(prompt).toContain("Icons of Depth and Complexity");
    expect(prompt).toContain("non-obvious");
  });

  it("parses fenced or raw JSON connection arrays", () => {
    const raw = parseConnectionsJson(`Here you go:
\`\`\`json
[{"icon":"Trends","summary":"Link","sourcePageId":"p1","sourcePageTitle":"T","sourceExcerpt":"E","whyNonObvious":"Because"}]
\`\`\``);
    expect(raw).toHaveLength(1);
    expect(raw[0]?.sourcePageId).toBe("p1");
    expect(parseConnectionsJson("not json")).toEqual([]);
  });
});
