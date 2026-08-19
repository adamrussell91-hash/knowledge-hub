import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "main.ts"), "utf8");

describe("Knowledge Hub rail", () => {
  it("does not expose an Alchemist workplace", () => {
    expect(main).not.toContain('data-nav="alchemist"');
    expect(main).not.toContain("renderAlchemist");
    expect(main).not.toContain("runAlchemist");
  });

  it("still renders coach archive citations after the Alchemist rail is gone", () => {
    expect(main).toContain("function findingCards");
  });
});
