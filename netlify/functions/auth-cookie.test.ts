import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { handler as login } from "./auth-login";
import { handler as logout } from "./auth-logout";

afterEach(() => {
  delete process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH;
  delete process.env.SESSION_SECRET;
});

describe("auth cookie scope", () => {
  it("allows the GitHub Pages origin to complete credentialed login", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH = createHash("sha256").update("passphrase").digest("hex");
    const result = await login({
      httpMethod: "POST",
      body: JSON.stringify({ passphrase: "passphrase" }),
      headers: { origin: "https://adamrussell91-hash.github.io" },
    } as never, {} as never);
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("https://adamrussell91-hash.github.io");
  });

  it("sets a host-only SameSite=None cookie like Life Hub and Teaching Hub", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH = createHash("sha256").update("passphrase").digest("hex");
    const result = await login({ httpMethod: "POST", body: JSON.stringify({ passphrase: "passphrase" }), headers: {} } as never, {} as never);
    const cookie = String(result.headers?.["Set-Cookie"] ?? "");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("clears the same host-only cookie on logout", async () => {
    const result = await logout({ httpMethod: "POST", headers: {} } as never, {} as never);
    const cookie = String(result.headers?.["Set-Cookie"] ?? "");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).not.toMatch(/Domain=/i);
  });
});
