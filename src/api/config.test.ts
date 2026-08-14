import { describe, expect, it } from "vitest";
import { PRODUCTION_API_BASE, resolveApiBase } from "./config";

describe("resolveApiBase", () => {
  it("uses same-origin /api on localhost", () => {
    expect(resolveApiBase("localhost")).toBe("/api");
    expect(resolveApiBase("127.0.0.1")).toBe("/api");
  });

  it("points at the sibling Netlify API host on the Pages domain", () => {
    expect(resolveApiBase("knowledge-hub.adam-russell.com")).toBe(PRODUCTION_API_BASE);
    expect(PRODUCTION_API_BASE).toBe("https://knowledge-api.adam-russell.com/api");
  });
});
