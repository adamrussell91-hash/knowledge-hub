import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUB,
  cleanReturnTo,
  parseLoginBody,
  readBody,
  safeReturnTo,
  sessionCookie,
  withSignInQuery,
} from "./authLogin";

describe("parseLoginBody", () => {
  it("reads a native form post so a phone can set a first-party cookie", () => {
    const parsed = parseLoginBody(
      "passphrase=secret+phrase&return_to=https%3A%2F%2Fknowledge-hub.adam-russell.com%2F",
      "application/x-www-form-urlencoded",
    );
    expect(parsed).toEqual({
      passphrase: "secret phrase",
      returnTo: "https://knowledge-hub.adam-russell.com/",
      viaForm: true,
    });
  });

  it("keeps the JSON body used by the existing fetch client", () => {
    const parsed = parseLoginBody(JSON.stringify({ passphrase: "secret" }), "application/json");
    expect(parsed).toEqual({ passphrase: "secret", returnTo: null, viaForm: false });
  });
});

describe("safeReturnTo", () => {
  it("allows the live hub and GitHub Pages hosts", () => {
    expect(safeReturnTo("https://knowledge-hub.adam-russell.com/#page")).toBe(
      "https://knowledge-hub.adam-russell.com/#page",
    );
    expect(safeReturnTo("https://adamrussell91-hash.github.io/knowledge-hub/")).toBe(
      "https://adamrussell91-hash.github.io/knowledge-hub/",
    );
  });

  it("rejects open redirects", () => {
    expect(safeReturnTo("https://evil.example/phish")).toBeNull();
    expect(safeReturnTo("https://knowledge-hub.adam-russell.com.evil.example/")).toBeNull();
    expect(safeReturnTo("http://knowledge-hub.adam-russell.com/")).toBeNull();
  });
});

describe("sign-in redirects", () => {
  it("appends and clears the signin query", () => {
    expect(withSignInQuery(DEFAULT_HUB, "invalid")).toBe("https://knowledge-hub.adam-russell.com/?signin=invalid");
    expect(cleanReturnTo("https://knowledge-hub.adam-russell.com/?signin=invalid")).toBe(
      "https://knowledge-hub.adam-russell.com/",
    );
  });

  it("sets the shared parent-domain session cookie", () => {
    expect(sessionCookie("token")).toContain("kh_session=token");
    expect(sessionCookie("token")).toContain("Domain=.adam-russell.com");
    expect(sessionCookie("token")).toContain("SameSite=None");
  });

  it("decodes a Netlify base64 body", () => {
    expect(readBody(Buffer.from("passphrase=a").toString("base64"), true)).toBe("passphrase=a");
  });
});
