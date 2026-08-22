import { describe, expect, it } from "vitest";
import { signInErrorMessage, takeSignInQuery } from "./loginGate";

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
