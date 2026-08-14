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

  it("publishes a placeholder, not the Vite app (site is GitHub Pages)", async () => {
    const config = await readFile(path.join(process.cwd(), "netlify.toml"), "utf8");
    const build = config.split("[dev]")[0] ?? config;
    expect(build).toContain('publish = "netlify/public"');
    expect(build).not.toMatch(/publish = "dist"/);
  });
});

describe("GitHub Pages deploy", () => {
  it("deploys dist via Actions like Life Hub and Teaching Hub", async () => {
    const workflow = await readFile(
      path.join(process.cwd(), ".github/workflows/pages.yml"),
      "utf8",
    );
    expect(workflow).toContain("actions/deploy-pages");
    expect(workflow).toContain("VITE_API_BASE");
    expect(workflow).toContain("knowledge-api.adam-russell.com");
  });
});
