import { describe, expect, it } from "vitest";
import { buildSynthesisPrompt, parseSynthesisJson } from "./synthesize";

describe("buildSynthesisPrompt", () => {
  it("asks for stance analysis against query and optional document context", () => {
    const prompt = buildSynthesisPrompt({
      query: "Is CBT stoic?",
      documentContext: "Thesis: CBT secularises stoicism.",
      sources: [{ pageId: "p1", title: "Notes", excerpt: "Epictetus" }],
    });
    expect(prompt).toContain("Is CBT stoic?");
    expect(prompt).toContain("CBT secularises");
    expect(prompt).toContain("supports");
    expect(prompt).toContain("complicates");
    expect(prompt).toContain("p1");
  });
});

describe("parseSynthesisJson", () => {
  it("parses fenced JSON with findings, gaps, and follow-ups", () => {
    const parsed = parseSynthesisJson(`
\`\`\`json
{"findings":[{"pageId":"p1","title":"T","sourceUrl":"https://notion.so/p1","excerpt":"e","stance":"extends","analysis":"why"}],"gaps":["g"],"followUpQueries":["q2"]}
\`\`\`
`);
    expect(parsed.findings[0]?.pageId).toBe("p1");
    expect(parsed.gaps).toEqual(["g"]);
    expect(parsed.followUpQueries).toEqual(["q2"]);
  });

  it("returns empty findings when the model does not emit JSON", () => {
    expect(parseSynthesisJson("sorry")).toEqual({ findings: [], gaps: [], followUpQueries: [] });
  });
});
