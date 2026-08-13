import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";
describe("session", () => { it("round-trips a session", () => expect(verifySession(signSession({ sub: "single-user" }, "a"), "a")).toEqual(expect.objectContaining({ sub: "single-user" }))); it("rejects an altered secret", () => expect(() => verifySession(signSession({ sub: "x" }, "a"), "b")).toThrow()); });
