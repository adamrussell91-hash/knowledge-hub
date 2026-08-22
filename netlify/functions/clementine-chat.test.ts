import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./clementine-chat";
import { resetLiveArchiveCache } from "./_lib/liveArchive";
import { signSession } from "./_lib/session";

const secret = "session-secret";
const kernelSecret = "kernel-secret-value";

function event(overrides: { cookie?: boolean; body?: string; method?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: overrides.method ?? "POST",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body:
      overrides.body ??
      JSON.stringify({
        hat: "scoping",
        messages: [{ role: "user", content: "What do I have on Gagne?" }],
      }),
  };
}

describe("clementine-chat handler", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.RESEARCH_KERNEL_SHARED_SECRET = kernelSecret;
    process.env.RESEARCH_KERNEL_URL = "https://kernel.test";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.RESEARCH_KERNEL_SHARED_SECRET;
    delete process.env.RESEARCH_KERNEL_URL;
    delete process.env.GITHUB_DATA_REPO;
    delete process.env.GITHUB_DATA_REPO_TOKEN;
    resetLiveArchiveCache();
    vi.unstubAllGlobals();
  });

  it("requires a site session", async () => {
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("starts a Worker write after a quick archive pull without calling Anthropic on Netlify", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("quick_research")) {
        return {
          ok: true,
          json: async () => ({
            query: "Gagne",
            round: 1,
            status: "done",
            findings: [],
            gaps: ["methods notes"],
            followUpQueries: [],
          }),
        };
      }
      if (String(url).includes("/chat/write/start")) {
        return { ok: true, json: async () => ({ writeSessionId: "w-9", status: "writing" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({ status: "writing", writeSessionId: "w-9" });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("anthropic"))).toBe(false);
  });

  it("falls back to the live archive when the kernel returns nothing", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("quick_research")) {
        return {
          ok: true,
          json: async () => ({
            query: "stoicism",
            round: 1,
            status: "done",
            findings: [],
            gaps: [],
            followUpQueries: [],
          }),
        };
      }
      if (String(url).includes("/chat/write/start")) {
        return { ok: true, json: async () => ({ writeSessionId: "w-stoic", status: "writing" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "scoping",
          messages: [{ role: "user", content: "what do I have on stoicism" }],
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body ?? "{}") as {
      status?: string;
      writeSessionId?: string;
      archiveFailed?: boolean;
      research?: { findings?: { pageId?: string }[] };
    };
    expect(payload).toMatchObject({ status: "writing", writeSessionId: "w-stoic" });
    expect(payload.archiveFailed).toBeFalsy();
    expect(payload.research?.findings?.[0]?.pageId).toBe("page_stoicism");
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("anthropic"))).toBe(false);
  });

  it("refuses to wait on Anthropic on Netlify when the Worker clock is missing", async () => {
    delete process.env.RESEARCH_KERNEL_SHARED_SECRET;
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "scoping",
          messages: [{ role: "user", content: "what do I have on stoicism" }],
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body ?? "{}").error).toMatch(/write clock/i);
  });

  it("starts a deep session without calling Anthropic", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("deep_research/start")) {
        return { ok: true, json: async () => ({ sessionId: "sess-9", status: "running" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "synthesis",
          depth: "iterative",
          messages: [{ role: "user", content: "Synthesise Gagne" }],
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toEqual({ status: "researching", researchSessionId: "sess-9" });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("anthropic"))).toBe(false);
    expect(response.body).not.toContain(kernelSecret);
  });
});
