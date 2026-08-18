import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./curator-nightly";

describe("curator nightly", () => {
  beforeEach(() => {
    process.env.URL = "https://knowledge-api.example";
    process.env.SESSION_SECRET = "session-secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 202 }));
  });
  afterEach(() => {
    delete process.env.URL;
    delete process.env.SESSION_SECRET;
    vi.unstubAllGlobals();
  });

  it("queues the background curator run", async () => {
    const response = await handler({} as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://knowledge-api.example/.netlify/functions/curator-run-background",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
