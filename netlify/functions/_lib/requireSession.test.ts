import { afterEach, describe, expect, it } from "vitest";
import { requireSession, sessionTokens } from "./requireSession";
import { signSession } from "./session";

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("requireSession", () => {
  it("includes CORS headers on 401 so the Pages origin can read the error", () => {
    const denied = requireSession({ headers: {}, httpMethod: "GET" } as never);
    expect(denied?.statusCode).toBe(401);
    expect(denied?.headers?.["Access-Control-Allow-Credentials"]).toBe("true");
    expect(denied?.headers?.["Content-Type"]).toMatch(/application\/json/);
  });

  it("reads Cookie when the header is capitalized", () => {
    process.env.SESSION_SECRET = "secret";
    const good = signSession({ sub: "single-user" }, "secret");
    expect(
      requireSession({
        headers: { Cookie: `kh_session=${good}` },
        httpMethod: "GET",
      } as never),
    ).toBeNull();
  });

  it("accepts a valid kh_session even if a stale leftover is listed first", () => {
    process.env.SESSION_SECRET = "secret";
    const good = signSession({ sub: "single-user" }, "secret");
    expect(
      requireSession({
        headers: { cookie: `kh_session=stale-from-domain-cookie; kh_session=${good}` },
        httpMethod: "GET",
      } as never),
    ).toBeNull();
  });

  it("joins multi-value Cookie headers", () => {
    process.env.SESSION_SECRET = "secret";
    const good = signSession({ sub: "single-user" }, "secret");
    expect(
      requireSession({
        headers: {},
        multiValueHeaders: { cookie: ["kh_session=stale", `kh_session=${good}`] },
        httpMethod: "GET",
      } as never),
    ).toBeNull();
  });
});

describe("sessionTokens", () => {
  it("returns every kh_session value in order", () => {
    expect(sessionTokens("kh_session=one; other=x; kh_session=two")).toEqual(["one", "two"]);
  });
});
