import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const index = readFileSync(join(dir, "..", "index.html"), "utf8");
const signInCss = readFileSync(join(dir, "..", "design-kit", "sign-in.css"), "utf8");
const renderLogin = main.slice(main.indexOf("function renderLogin"), main.indexOf("async function boot"));

describe("Knowledge Hub sign-in gate", () => {
  it("posts the live passphrase at the API so a phone can store a first-party cookie", () => {
    expect(main).toContain("loginFormAction");
    expect(main).toContain('name="return_to"');
    expect(main).toContain("requestSubmit");
    expect(main).toContain("form.submit()");
    expect(main).not.toContain("form.onsubmit");
  });

  it("shows the locked tile-free gate and a bounced passphrase error", () => {
    expect(renderLogin).not.toContain('class="sign-in__mark"');
    expect(renderLogin).not.toContain("icons/knowledge.svg");
    expect(main).toContain("takeSignInQuery");
    expect(main).toContain("failedLoginMessage");
  });

  it("uses the locked design-kit passphrase field sizing", () => {
    expect(signInCss).toContain("font-size: var(--text-base)");
    expect(index).toContain("interactive-widget=resizes-content");
  });
});
