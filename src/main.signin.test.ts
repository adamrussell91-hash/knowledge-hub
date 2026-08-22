import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const loginHtml = readFileSync(join(dir, "..", "netlify", "public", "login.html"), "utf8");
const renderLogin = main.slice(main.indexOf("function renderLogin"), main.indexOf("async function boot"));

describe("Knowledge Hub sign-in gate", () => {
  it("sends the live gate to the API host so iPhone can store a first-party cookie", () => {
    expect(main).toContain("loginPageUrl");
    expect(renderLogin).toContain("location.replace");
    expect(loginHtml).toContain('action="/api/auth-login"');
    expect(loginHtml).toContain('name="return_to"');
    expect(loginHtml).toContain("novalidate");
  });

  it("keeps the locked tile-free card on the first-party gate", () => {
    expect(loginHtml).not.toContain("sign-in__mark");
    expect(loginHtml).toContain("Knowledge Hub");
    expect(renderLogin).not.toContain('class="sign-in__mark"');
  });
});
