import { describe, expect, it } from "vitest";
import { buildSynthesisPrompt, parseSynthesisJson } from "./synthesize";

describe("buildSynthesisPrompt", () => {
  it("asks for stance analysis against query and optional document context", () => {
    const prompt = buildSynthesisPrompt({
      query: "Is CBT stoic?",
      documentContext: "Thesis: CBT secularises stoicism.",
      sources: [{ pageId: "p1", title: "Notes", excerpt: "Epictetus", tags: ["Motivation and Self Regulation"] }],
    });
    expect(prompt).toContain("Is CBT stoic?");
    expect(prompt).toContain("CBT secularises");
    expect(prompt).toContain("supports");
    expect(prompt).toContain("complicates");
    expect(prompt).toContain("p1");
    expect(prompt).toContain("Motivation and Self Regulation");
    expect(prompt).toContain("sourceType");
    expect(prompt).toContain("claimRelationship");
    expect(prompt).toContain("never invent method");
  });

  it("speaks as Clementine and still demands JSON only", () => {
    const prompt = buildSynthesisPrompt({
      query: "Is CBT stoic?",
      sources: [{ pageId: "p1", title: "Notes", excerpt: "Epictetus" }],
    });
    expect(prompt).toContain("Professor Clementine Haig");
    expect(prompt).toContain("research and knowledge synthesizer");
    expect(prompt).toContain("Never the wrong office");
    expect(prompt).toContain("Return only JSON");
    expect(prompt).not.toContain("You are a research assistant");
    expect(prompt).not.toMatch(/academic writing coach/i);
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

  it("keeps evidence packet fields on a finding", () => {
    const parsed = parseSynthesisJson(`{"findings":[{"pageId":"p1","title":"T","sourceUrl":"https://notion.so/p1","excerpt":"e","stance":"supports","analysis":"why","sourceType":"empirical","method":"survey","population":"high ability adolescents","keyFinding":"Need satisfaction tracked wellbeing","claimRelationship":"direct","confidence":"medium","limitation":"correlational"}],"gaps":[],"followUpQueries":[]}`);
    expect(parsed.findings[0]).toMatchObject({
      sourceType: "empirical",
      method: "survey",
      population: "high ability adolescents",
      keyFinding: "Need satisfaction tracked wellbeing",
      claimRelationship: "direct",
      confidence: "medium",
    });
  });

  it("returns empty findings when the model does not emit JSON", () => {
    expect(parseSynthesisJson("sorry")).toEqual({ findings: [], gaps: [], followUpQueries: [] });
  });
});
