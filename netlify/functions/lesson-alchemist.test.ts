import { describe, expect, it } from "vitest";
import { buildAlchemistPrompt } from "./lesson-alchemist";
describe("buildAlchemistPrompt", () => it("asks for non-obvious ICM connections", () => { const prompt = buildAlchemistPrompt({ lessonText: "French Revolution", retrieved: [{ pageId: "p", title: "Entropy", excerpt: "Thermodynamics" }] }); expect(prompt).toContain("French Revolution"); expect(prompt).toContain("Entropy"); expect(prompt).toContain("Icons of Depth and Complexity"); expect(prompt).toContain("non-obvious"); }));
