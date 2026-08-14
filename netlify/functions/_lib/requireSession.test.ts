import { describe, expect, it } from "vitest";
import { requireSession } from "./requireSession";

describe("requireSession", () => {
  it("includes CORS headers on 401 so the Pages origin can read the error", () => {
    const denied = requireSession({ headers: {}, httpMethod: "GET" } as never);
    expect(denied?.statusCode).toBe(401);
    expect(denied?.headers?.["Access-Control-Allow-Credentials"]).toBe("true");
  });
});
