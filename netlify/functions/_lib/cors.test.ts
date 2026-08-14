import { describe, expect, it } from "vitest";
import { cors, preflight } from "./cors";

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
});
