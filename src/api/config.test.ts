import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCTION_TIDY_ORIGIN,
  LEGACY_API_BASE,
  PRODUCTION_API_BASE,
  resolveApiBase,
  resolveLegacyApiBase,
} from "./config";

describe("resolveApiBase", () => {
  it("uses same-origin /api on localhost", () => {
    expect(resolveApiBase("localhost")).toBe("/api");
    expect(resolveApiBase("127.0.0.1")).toBe("/api");
    expect(resolveLegacyApiBase("localhost")).toBe("/api");
  });

  it("points notes, search, quiz, and auth at the umbrella Knowledge prefix", () => {
    expect(resolveApiBase("knowledge-hub.adam-russell.com")).toBe(PRODUCTION_API_BASE);
    expect(PRODUCTION_API_BASE).toBe("https://api.adam-russell.com/api/knowledge");
  });

  it("keeps leftover Clementine and media APIs on knowledge-api", () => {
    expect(resolveLegacyApiBase("knowledge-hub.adam-russell.com")).toBe(LEGACY_API_BASE);
    expect(LEGACY_API_BASE).toBe("https://knowledge-api.adam-russell.com/api");
  });
});

it("publishes the dedicated Worker tidy origin", () => {
  expect(DEFAULT_PRODUCTION_TIDY_ORIGIN).toBe("https://knowledge-tidy.adam-russell.com");
});
