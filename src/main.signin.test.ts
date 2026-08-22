import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const renderLogin = main.slice(main.indexOf("function renderLogin"), main.indexOf("async function boot"));

describe("Knowledge Hub sign-in gate", () => {
  it("keeps the gate on the hub and signs in with JSON like Teaching Hub", () => {
    expect(renderLogin).not.toContain("location.replace");
    expect(renderLogin).not.toContain("login.html");
    expect(renderLogin).toContain("await login(");
    expect(renderLogin).toContain("addEventListener(\"submit\"");
    expect(main).not.toContain("form.onsubmit");
  });

  it("does not send the phone to the API host", () => {
    expect(main).not.toContain("loginPageUrl");
  });
});
