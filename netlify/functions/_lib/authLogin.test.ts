import { describe, expect, it } from "vitest";
import { expiredSessionCookie, expiredSessionCookies, loginCookies, sessionCookie } from "./authLogin";

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

  it("expires leftover Domain= and SameSite=Lax copies from earlier deploys", () => {
    const expired = expiredSessionCookies();
    expect(expired.some(cookie => cookie.includes("Domain=.adam-russell.com") && cookie.includes("SameSite=Lax"))).toBe(
      true,
    );
    expect(expired.some(cookie => cookie.includes("Domain=.adam-russell.com") && cookie.includes("SameSite=None"))).toBe(
      true,
    );
    expect(expired.every(cookie => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("sets the host-only cookie after clearing leftovers", () => {
    const cookies = loginCookies("token");
    expect(cookies.at(-1)).toBe(sessionCookie("token"));
    expect(cookies.slice(0, -1)).toEqual(expiredSessionCookies());
  });
});
