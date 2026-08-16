import { describe, expect, it } from "vitest";
import { handleCaptureRequest, type CaptureBindings } from "./http";

function bindings(overrides: Partial<CaptureBindings> = {}): CaptureBindings {
  return {
    secret: "kernel-secret",
    allowedOrigin: "https://teaching-hub.example",
    extract: async () => ({ kind: "voice", filename: "v.webm", text: "spoken" }),
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://kernel.test${path}`, {
    method: "POST",
    ...init,
    headers: {
      Origin: "https://teaching-hub.example",
      "Content-Type": "application/json",
      "x-research-kernel-secret": "kernel-secret",
      ...(init.headers ?? {}),
    },
  });
}

describe("handleCaptureRequest", () => {
  it("rejects a missing shared secret", async () => {
    const response = await handleCaptureRequest(
      request("/capture", {
        headers: {
          Origin: "https://teaching-hub.example",
          "Content-Type": "application/json",
          "x-research-kernel-secret": "",
        },
      }),
      bindings(),
    );
    expect(response.status).toBe(401);
  });

  it("returns extracted text", async () => {
    const response = await handleCaptureRequest(
      request("/capture", { body: JSON.stringify({ r2_key: "notes/page_hub_aa/v.webm" }) }),
      bindings(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "spoken" });
  });

  it("maps extract status errors", async () => {
    const response = await handleCaptureRequest(
      request("/capture", { body: JSON.stringify({ r2_key: "bad" }) }),
      bindings({
        extract: async () => {
          const error = Object.assign(new Error("r2_key must be notes|university/<page>/<file>"), { status: 400 });
          throw error;
        },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("404s other paths", async () => {
    const response = await handleCaptureRequest(request("/quick_research", { body: "{}" }), bindings());
    expect(response.status).toBe(404);
  });
});
