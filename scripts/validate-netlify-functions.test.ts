import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Netlify function layout", () => {
  it("keeps deployable handlers separate from private helpers", async () => {
    const config = await readFile(path.join(process.cwd(), "netlify.toml"), "utf8");
    expect(config).toContain('functions = "netlify/handlers"');
    const entries = await readdir(path.join(process.cwd(), "netlify/handlers"));
    expect(entries.some(entry => entry.startsWith("_"))).toBe(false);
  });
});
