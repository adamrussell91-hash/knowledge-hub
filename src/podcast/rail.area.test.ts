import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rail = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "rail.ts"), "utf8");

describe("podcast rail has no University / Notes split", () => {
  it("does not render an area picker or send area on scope", () => {
    expect(rail).not.toContain("podcast-area");
    expect(rail).not.toContain(">University<");
  });
});
