import { describe, expect, it } from "vitest";
import { loadPromptFile } from "./loadFromDisk";

describe("loadPromptFile", () => {
  it("loads clementine-voice.md from prompts/", () => {
    expect(loadPromptFile("clementine-voice.md")).toContain("Professor Clementine Haig");
  });

  it("throws when the file is absent", () => {
    expect(() => loadPromptFile("clementine-missing.md")).toThrow(/clementine-missing\.md/);
  });
});
