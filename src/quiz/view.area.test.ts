import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "view.ts"), "utf8");

describe("quiz rail has no University / Notes split", () => {
  it("does not render area pickers", () => {
    expect(view).not.toContain("quiz-area");
    expect(view).not.toContain("map-area");
    expect(view).not.toContain("dump-area");
    expect(view).not.toContain(">University<");
  });
});
