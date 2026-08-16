import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./capture";
import { signSession } from "./_lib/session";

const secret = "session-secret";
const kernelSecret = "kernel-secret-value";

function event(overrides: { cookie?: boolean; body?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: "POST",
    path: "/api/capture",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? JSON.stringify({ r2_key: "notes/page_hub_aa/voice.webm" }),
  };
}

describe("capture proxy", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
    process.env.RESEARCH_KERNEL_SHARED_SECRET = kernelSecret;
    process.env.RESEARCH_KERNEL_URL = "https://kernel.test";
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.RESEARCH_KERNEL_SHARED_SECRET;
    delete process.env.RESEARCH_KERNEL_URL;
    vi.unstubAllGlobals();
  });

  it("requires a site session", async () => {
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response?.statusCode).toBe(401);
  });

  it("posts r2_key to the worker with the kernel secret and never returns it", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ text: "spoken" }),
    }));
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(event() as never, {} as never);
    expect(response?.statusCode).toBe(200);
    expect(response?.body).toBe(JSON.stringify({ text: "spoken" }));
    expect(response?.body).not.toContain(kernelSecret);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://kernel.test/capture");
    expect((init.headers as Record<string, string>)["x-research-kernel-secret"]).toBe(kernelSecret);
    expect(JSON.parse(String(init.body))).toEqual({ r2_key: "notes/page_hub_aa/voice.webm" });
  });

  it("rejects a missing r2_key", async () => {
    const response = await handler(event({ body: "{}" }) as never, {} as never);
    expect(response?.statusCode).toBe(400);
  });
});
