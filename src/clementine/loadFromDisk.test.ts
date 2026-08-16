import { describe, expect, it } from "vitest";
import { loadPromptFile } from "./loadFromDisk";

describe("loadPromptFile", () => {
  it("loads clementine-voice.md from prompts/", () => {
    expect(loadPromptFile("clementine-voice.md")).toContain("Professor Clementine Haig");
  });

  it("loads the podcast host and editor prompts from prompts/", () => {
    expect(loadPromptFile("clementine-podcast.md")).toContain("immediately preceding turn");
    expect(loadPromptFile("clementine-podcast.md")).toContain("what today is about");
    expect(loadPromptFile("ann-podcast.md")).toContain("bursts than Clementine");
    expect(loadPromptFile("podcast-editor.md")).toContain("Rewrite the entire episode");
    expect(loadPromptFile("podcast-editor.md")).toContain("what today is about");
    expect(loadPromptFile("podcast-editor.md")).toMatch(/no ["']?Adam["']?/i);
  });

  it("throws when the file is absent", () => {
    expect(() => loadPromptFile("clementine-missing.md")).toThrow(/clementine-missing\.md/);
  });
});
