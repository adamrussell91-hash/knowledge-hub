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

  it("sets the shared parent domain on login", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH = createHash("sha256").update("passphrase").digest("hex");
    const result = await login({ httpMethod: "POST", body: JSON.stringify({ passphrase: "passphrase" }), headers: {} } as never, {} as never);
    expect(result.headers?.["Set-Cookie"]).toContain("Domain=.adam-russell.com");
  });

  it("redirects a native form post so iOS can store a first-party cookie", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH = createHash("sha256").update("passphrase").digest("hex");
    const result = await login({
      httpMethod: "POST",
      body: "passphrase=passphrase&return_to=https%3A%2F%2Fknowledge-hub.adam-russell.com%2F",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    } as never, {} as never);
    expect(result.statusCode).toBe(303);
    expect(result.headers?.Location).toBe("https://knowledge-hub.adam-russell.com/");
    expect(result.headers?.["Set-Cookie"]).toContain("Domain=.adam-russell.com");
  });

  it("bounces a bad form passphrase back to the gate", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.KNOWLEDGE_HUB_PASSPHRASE_HASH = createHash("sha256").update("passphrase").digest("hex");
    const result = await login({
      httpMethod: "POST",
      body: "passphrase=nope&return_to=https%3A%2F%2Fknowledge-hub.adam-russell.com%2F",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    } as never, {} as never);
    expect(result.statusCode).toBe(303);
    expect(result.headers?.Location).toBe(
      "/login.html?signin=invalid&return_to=https%3A%2F%2Fknowledge-hub.adam-russell.com%2F",
    );
    expect(result.headers?.["Set-Cookie"]).toBeUndefined();
  });

  it("clears the shared parent domain on logout", async () => {
    const result = await logout({ httpMethod: "POST", headers: {} } as never, {} as never);
    expect(result.headers?.["Set-Cookie"]).toContain("Domain=.adam-russell.com");
  });
});
