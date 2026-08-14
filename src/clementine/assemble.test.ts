import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleClementinePrompt } from "./assemble";

const prompt = (name: string) => readFileSync(join(process.cwd(), "prompts", name), "utf8");

describe("assembleClementinePrompt", () => {
  it("locks voice phrases and excludes Notion-only duties", () => {
    const assembled = assembleClementinePrompt({
      voice: prompt("clementine-voice.md"),
      job: prompt("clementine-university.md"),
      surface: "You are filing a research brief. Return JSON only.",
      payload: "Query: stoicism",
    });
    expect(assembled).toContain("Professor Clementine Haig");
    expect(assembled).toContain("diagnose before she prescribes");
    expect(assembled).toContain("UNSW Master of Education");
    expect(assembled).toContain("APA 7th");
    expect(assembled).toContain("Reverse Outline");
    expect(assembled).toContain("Return JSON only");
    expect(assembled).toContain("Query: stoicism");
    expect(assembled).not.toMatch(/Central Node/i);
    expect(assembled).not.toMatch(/University Reading Protocol/i);
    expect(assembled).not.toMatch(/search the Knowledge Hub Notion/i);
  });

  it("throws when the voice file is missing", () => {
    expect(() =>
      assembleClementinePrompt({ voice: "", job: "job", surface: "s", payload: "p" }),
    ).toThrow(/clementine-voice\.md/);
  });

  it("throws when the job file is missing", () => {
    expect(() =>
      assembleClementinePrompt({ voice: "voice", job: "  ", surface: "s", payload: "p" }),
    ).toThrow(/job/);
  });
});
