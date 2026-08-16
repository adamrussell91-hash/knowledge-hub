import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findTurnAudioKey, handler } from "./podcast";
import { signSession } from "./_lib/session";

const secret = "session-secret";
const kernelSecret = "kernel-secret-value";

function event(overrides: { cookie?: boolean; body?: string; method?: string; path?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: overrides.method ?? "POST",
    path: overrides.path ?? "/api/podcast/start",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? JSON.stringify({ mode: "recap" }),
  };
}

describe("podcast proxy", () => {
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

  it("posts start to the worker with the kernel secret and never returns it", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "ep-1", status: "running" }),
    }));
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(event({ body: JSON.stringify({ mode: "recap" }) }) as never, {} as never);
    expect(response?.statusCode).toBe(200);
    expect(response?.body).not.toContain(kernelSecret);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://kernel.test/podcast/start");
    expect((init.headers as Record<string, string>)["x-research-kernel-secret"]).toBe(kernelSecret);
    expect(JSON.parse(String(init.body))).toEqual({ mode: "recap" });
  });

  it("lists the index at GET /api/podcast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ episodes: [], series: [] }),
      })),
    );
    const response = await handler(
      event({ method: "GET", path: "/api/podcast", body: undefined }) as never,
      {} as never,
    );
    expect(response?.statusCode).toBe(200);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://kernel.test/podcast/index");
  });

  it("returns 404 when a turn has no audioKey", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "ep-1", turns: [{ id: "t1", kind: "content", text: "hi" }] }),
      })),
    );
    const response = await handler(
      event({ method: "GET", path: "/api/podcast/ep-1/audio/t1", body: undefined }) as never,
      {} as never,
    );
    expect(response?.statusCode).toBe(404);
  });
});

describe("findTurnAudioKey", () => {
  it("selects a turn audio key only when present", () => {
    expect(findTurnAudioKey({ turns: [{ id: "t1" }] }, "t1")).toBeNull();
    expect(findTurnAudioKey({ turns: [{ id: "t1", audioKey: "podcast/audio/ep-1/t1" }] }, "t1")).toBe(
      "podcast/audio/ep-1/t1",
    );
  });
});
