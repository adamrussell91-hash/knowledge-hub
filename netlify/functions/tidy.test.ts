import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./tidy";
import { signSession } from "./_lib/session";

const secret = "session-secret";
const kernelSecret = "kernel-secret-value";

function event(overrides: { cookie?: boolean; body?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: "POST",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? JSON.stringify({ id: "page_hub_p" }),
  };
}

describe("tidy proxy", () => {
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

  it("requires an id", async () => {
    const response = await handler(event({ body: "{}" }) as never, {} as never);
    expect(response?.statusCode).toBe(400);
  });

  it("accepts tidy on the worker with the kernel secret and never returns it", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ accepted: true, id: "page_hub_p" }),
    }));
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(event() as never, {} as never);
    expect(response?.statusCode).toBe(202);
    expect(response?.body).toBe(JSON.stringify({ accepted: true, id: "page_hub_p" }));
    expect(response?.body).not.toContain(kernelSecret);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://kernel.test/tidy");
    expect((init.headers as Record<string, string>)["x-research-kernel-secret"]).toBe(kernelSecret);
    expect(JSON.parse(String(init.body))).toEqual({ id: "page_hub_p" });
  });
});
