import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const index = readFileSync(join(dir, "..", "index.html"), "utf8");
const signInCss = readFileSync(join(dir, "..", "design-kit", "sign-in.css"), "utf8");

describe("Knowledge Hub sign-in gate", () => {
  it("posts the live passphrase at the API so a phone can store a first-party cookie", () => {
    expect(main).toContain("loginFormAction");
    expect(main).toContain('name="return_to"');
    expect(main).toContain("requestSubmit");
    expect(main).toContain("form.submit()");
    expect(main).not.toContain("form.onsubmit");
  });

  it("shows the locked hub tile and a bounced passphrase error", () => {
    expect(main).toContain('class="sign-in__mark"');
    expect(main).toContain("icons/knowledge.svg");
    expect(main).toContain("takeSignInQuery");
    expect(main).toContain("failedLoginMessage");
  });

  it("keeps the passphrase field large enough that iOS will not zoom", () => {
    expect(signInCss).toContain("font-size: var(--text-md)");
    expect(index).toContain("interactive-widget=resizes-content");
  });
});
