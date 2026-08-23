import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("tidy prompt", () => {
  it("sets preservation, hierarchy, repair, and the closed vocabulary", async () => {
    const prompt = await readFile(new URL("../../prompts/tidy.md", import.meta.url), "utf8");
    expect(prompt).toMatch(/heading hierarchy/i);
    expect(prompt).toMatch(/duplicate H1/i);
    expect(prompt).toMatch(/lists.*block quotes.*Notion junk/is);
    expect(prompt).toMatch(/Three tags is the target/i);
    expect(prompt).toMatch(/Never more than three/i);
    expect(prompt).not.toMatch(/One tag is enough/i);
    expect(prompt).toContain("Learning Science and Cognition");
    expect(prompt).toContain("Philosophy Knowledge and Society");
    expect(prompt).toContain("Technology AI and Digital Learning");
    expect(prompt).not.toMatch(/\bHistory\b.*\bClassics\b/s);
  });
});
