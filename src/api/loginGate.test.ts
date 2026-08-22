import { describe, expect, it } from "vitest";
import { loginFormAction, loginPageUrl, signInErrorMessage, takeSignInQuery } from "./loginGate";

describe("loginFormAction", () => {
  it("posts the live gate at the Netlify login function", () => {
    expect(loginFormAction("https://knowledge-api.adam-russell.com/api", false)).toBe(
      "https://knowledge-api.adam-russell.com/api/auth-login",
    );
  });

  it("stays on the JS path for local preview data", () => {
    expect(loginFormAction("https://knowledge-api.adam-russell.com/api", true)).toBeNull();
  });
});

describe("loginPageUrl", () => {
  it("sends the live gate to the API host so iOS can set a first-party cookie", () => {
    expect(loginPageUrl("https://knowledge-api.adam-russell.com/api", false)).toBe(
      "https://knowledge-api.adam-russell.com/login.html",
    );
  });

  it("does not bounce local preview off localhost", () => {
    expect(loginPageUrl("/api", false)).toBeNull();
    expect(loginPageUrl("https://knowledge-api.adam-russell.com/api", true)).toBeNull();
  });
});

describe("takeSignInQuery", () => {
  it("reads an invalid passphrase bounce and strips the query", () => {
    expect(takeSignInQuery("https://knowledge-hub.adam-russell.com/?signin=invalid")).toEqual({
      message: "Invalid passphrase",
      nextUrl: "/",
    });
  });

  it("maps a generic error code", () => {
    expect(signInErrorMessage("error")).toBe("Unable to sign in. Please try again.");
    expect(signInErrorMessage(null)).toBeNull();
  });
});
