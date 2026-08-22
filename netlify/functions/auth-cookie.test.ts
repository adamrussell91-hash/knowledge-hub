import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { handler as login } from "./auth-login";
import { handler as logout } from "./auth-logout";

afterEach(() => {
  delete process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH;
  delete process.env.SESSION_SECRET;
});

function setCookies(result: { headers?: Record<string, unknown>; multiValueHeaders?: Record<string, unknown> }) {
  const multi = result.multiValueHeaders?.["Set-Cookie"];
  if (Array.isArray(multi)) return multi.map(String);
  const single = result.headers?.["Set-Cookie"];
  return single == null ? [] : [String(single)];
}

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
    expect(result.headers?.["Content-Type"]).toMatch(/application\/json/);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("sets a host-only SameSite=None cookie like Life Hub and Teaching Hub", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH = createHash("sha256").update("passphrase").digest("hex");
    const result = await login({ httpMethod: "POST", body: JSON.stringify({ passphrase: "passphrase" }), headers: {} } as never, {} as never);
    const cookies = setCookies(result);
    const session = cookies.find(cookie => cookie.includes("kh_session=") && !cookie.includes("Max-Age=0"));
    expect(session).toContain("SameSite=None");
    expect(session).toContain("Secure");
    expect(session).toContain("HttpOnly");
    expect(session).not.toMatch(/Domain=/i);
    expect(cookies.some(cookie => cookie.includes("Domain=.adam-russell.com") && cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("clears leftover cookie variants on logout", async () => {
    const result = await logout({ httpMethod: "POST", headers: {} } as never, {} as never);
    const cookies = setCookies(result);
    expect(cookies.every(cookie => cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some(cookie => cookie.includes("SameSite=None"))).toBe(true);
    expect(cookies.some(cookie => cookie.includes("Domain=.adam-russell.com"))).toBe(true);
  });
});
