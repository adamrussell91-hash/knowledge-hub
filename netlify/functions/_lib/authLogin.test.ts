import { describe, expect, it } from "vitest";
import { expiredSessionCookie, sessionCookie } from "./authLogin";

describe("session cookie", () => {
  it("matches Life Hub and Teaching Hub: host-only SameSite=None", () => {
    const cookie = sessionCookie("token");
    expect(cookie).toContain("kh_session=token");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).not.toMatch(/Domain=/i);
    expect(expiredSessionCookie()).toContain("Max-Age=0");
    expect(expiredSessionCookie()).not.toMatch(/Domain=/i);
  });
});
