import { describe, expect, it } from "vitest";
import { readApiError, searchHits, sessionAuthenticated, sessionTargets, unwrapApiPayload } from "./envelope";

describe("envelope", () => {
  it("unwraps Life { ok, data } and passes raw Knowledge JSON through", () => {
    expect(unwrapApiPayload<{ id: string }>({ ok: true, data: { id: "p" } })).toEqual({ id: "p" });
    expect(unwrapApiPayload<{ id: string }>({ id: "p" })).toEqual({ id: "p" });
  });

  it("reads search hits from either an array or { hits }", () => {
    expect(searchHits([{ id: "p" }])).toEqual([{ id: "p" }]);
    expect(searchHits({ hits: [{ id: "p" }] })).toEqual([{ id: "p" }]);
    expect(searchHits(null)).toEqual([]);
  });

  it("accepts both Knowledge and Life session shapes", () => {
    expect(sessionAuthenticated({ authenticated: true })).toBe(true);
    expect(sessionAuthenticated({ ok: true, data: { authenticated: true } })).toBe(true);
    expect(sessionAuthenticated({ authenticated: false })).toBe(false);
  });

  it("only signs in on the umbrella Knowledge prefix", () => {
    expect(sessionTargets("/api", "/api", "/auth-login")).toEqual(["/api/auth-login"]);
    expect(
      sessionTargets(
        "https://api.adam-russell.com/api/knowledge",
        "https://knowledge-api.adam-russell.com/api",
        "/auth-login",
      ),
    ).toEqual(["https://api.adam-russell.com/api/knowledge/auth-login"]);
  });

  it("reads Life error.message and Knowledge error strings", () => {
    expect(readApiError({ error: { message: "save collided, try again" } }, 409, "/pages-save")).toBe(
      "save collided, try again",
    );
    expect(readApiError({ error: "Invalid passphrase" }, 401, "/auth-login")).toBe("Invalid passphrase");
  });
});
