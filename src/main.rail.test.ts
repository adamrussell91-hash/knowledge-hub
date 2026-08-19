import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const css = readFileSync(join(dir, "style.css"), "utf8");

describe("Knowledge Hub rail", () => {
  it("does not expose an Alchemist workplace", () => {
    expect(main).not.toContain('data-nav="alchemist"');
    expect(main).not.toContain("renderAlchemist");
    expect(main).not.toContain("runAlchemist");
  });

  it("still renders coach archive citations after the Alchemist rail is gone", () => {
    expect(main).toContain("function findingCards");
  });

  it("offers a quiet Clean up control beside Edit in the reader", () => {
    expect(main).toContain('class="btn btn--ghost reader__tidy" data-tidy type="button"');
    expect(main).toContain("Clean up");
    expect(main).toContain("Cleaning up…");
    expect(main).not.toMatch(/hub-utilities[\s\S]*data-tidy/);
  });

  it("has no University / Notes split in the rail, filters, or compose", () => {
    expect(main).not.toContain('data-nav="university"');
    expect(main).not.toContain('data-nav="notes"');
    expect(main).not.toContain('data-filter="university"');
    expect(main).not.toContain('data-filter="notes"');
    expect(main).not.toContain("compose-area");
    expect(main).not.toContain("University pages stay in the archive");
  });

  it("makes Knowledge Hub a home control", () => {
    expect(main).toContain('class="rail__brand" data-home');
    expect(main).toContain('aria-label="Knowledge Hub home"');
    expect(main).toContain("function goToHome");
  });
});

describe("note reader and editor fill the canvas", () => {
  it("does not cap compose or the reader body to a skinny column", () => {
    expect(css).toContain(".canvas:has(> .compose)");
    expect(css).toContain(".canvas:has(> .reader)");
    expect(css).not.toMatch(/\.compose\s*\{[^}]*max-width:\s*44rem/);
    expect(css).not.toMatch(/\.reader__body\s*\{[^}]*max-width:\s*var\(--measure\)/);
  });

  it("marks the body field so the editor can grow with the page", () => {
    expect(main).toContain("compose__field compose__field--body");
  });
});

