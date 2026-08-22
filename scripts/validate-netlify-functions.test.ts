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
    expect(build).toContain("SECRETS_SCAN_OMIT_KEYS");
    expect(build).toContain("R2_BUCKET");
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

describe("Clementine chat has a long enough function window", () => {
  it("gives clementine-chat the 26s Netlify max so archive + Claude are not killed at 10s", async () => {
    const config = await readFile(path.join(process.cwd(), "netlify.toml"), "utf8");
    expect(config).toMatch(/\[functions\.clementine-chat\][\s\S]*timeout = 26/);
  });
});

describe("Note tidy button uses the session API host", () => {
  it("adds a session-gated /api/tidy function without new Netlify secrets", async () => {
    const config = await readFile(path.join(process.cwd(), "netlify.toml"), "utf8");
    expect(config).toContain("/api/clementine-chat");
    expect(config).toContain("/api/tidy");
    expect(config).toContain("prompts/tidy.md");
    const source = await readFile(path.join(process.cwd(), "netlify/functions/tidy.ts"), "utf8");
    expect(source).toContain("requireSession");
    expect(source).toContain("tidyPageDirect");
    expect(source).not.toMatch(/VITE_/);
    const handlers = await readdir(path.join(process.cwd(), "netlify/handlers"));
    expect(handlers).toContain("tidy.ts");
  });
});

describe("Curator workflow secrets", () => {
  it("does not use custom GITHUB_-prefixed secret names (GitHub rejects them)", async () => {
    const workflow = await readFile(path.join(process.cwd(), ".github/workflows/curator.yml"), "utf8");
    expect(workflow).not.toMatch(/secrets\.GITHUB_[A-Z0-9_]+/);
    expect(workflow).toContain("secrets.DATA_REPO_TOKEN");
  });
});

describe("Stamp origins workflow", () => {
  it("writes notebook, book, and PD pills into the data repo with the same token as tidy", async () => {
    const workflow = await readFile(path.join(process.cwd(), ".github/workflows/stamp-origins.yml"), "utf8");
    expect(workflow).not.toMatch(/secrets\.GITHUB_[A-Z0-9_]+/);
    expect(workflow).toContain("secrets.DATA_REPO_TOKEN");
    expect(workflow).toContain("adamrussell91-hash/knowledge-hub-data");
    expect(workflow).toContain("scripts/stamp-origins.ts");
    expect(workflow).toContain("--execute");
    expect(workflow).not.toContain("--from-notion");
    expect(workflow).toContain("Stamp notebook, book, and PD origin pills from Notion snapshot.");
  });
});
