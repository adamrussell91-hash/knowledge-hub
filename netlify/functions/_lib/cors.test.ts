import { describe, expect, it } from "vitest";
import { cors, headerValue, jsonHeaders, preflight, requestOrigin } from "./cors";

describe("cors", () => {
  it("allows credentialed browser calls from the Pages origin", () => {
    const headers = cors("https://knowledge-hub.adam-russell.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://knowledge-hub.adam-russell.com");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/Content-Type/);
    expect(headers["Access-Control-Allow-Methods"]).toMatch(/POST/);
  });

  it("answers OPTIONS preflight with 204", () => {
    const response = preflight({ httpMethod: "OPTIONS" } as never);
    expect(response?.statusCode).toBe(204);
  });

  it("lets real methods through", () => {
    expect(preflight({ httpMethod: "GET" } as never)).toBeNull();
  });

  it("reads Origin when the header is capitalized", () => {
    expect(headerValue({ Origin: "https://knowledge-hub.adam-russell.com" }, "origin")).toBe(
      "https://knowledge-hub.adam-russell.com",
    );
    expect(requestOrigin({ Origin: "https://knowledge-hub.adam-russell.com" })).toBe(
      "https://knowledge-hub.adam-russell.com",
    );
    expect(jsonHeaders("https://knowledge-hub.adam-russell.com")["Cache-Control"]).toBe("no-store");
  });
});
