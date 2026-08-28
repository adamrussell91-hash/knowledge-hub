import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./clementine-chat";
import { resetLiveArchiveCache } from "./_lib/liveArchive";
import { signSession } from "./_lib/session";

const secret = "session-secret";
const kernelSecret = "kernel-secret-value";

function event(overrides: { cookie?: boolean; body?: string; method?: string; isBase64Encoded?: boolean } = {}) {
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
    isBase64Encoded: overrides.isBase64Encoded,
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

  it("names an unknown hat instead of a vague parse error", async () => {
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "not-a-hat",
          messages: [{ role: "user", content: "hello" }],
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? "{}").error).toMatch(/Unknown chat hat "not-a-hat"/);
    expect(JSON.parse(response.body ?? "{}").error).toMatch(/fromBook/);
  });

  it("accepts a base64-encoded fromBook body", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/chat/write/start")) {
        const body = JSON.parse(String(init?.body));
        expect(body.webSearch).toBe(true);
        expect(body.system).toContain("From a book protocol");
        return { ok: true, json: async () => ({ writeSessionId: "w-b64", status: "writing" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const payload = JSON.stringify({
      hat: "fromBook",
      bookContext: { label: "Make It Stick", locus: "p. 142" },
      messages: [{ role: "user", content: "desirable difficulties" }],
    });
    const response = await handler(
      event({ body: Buffer.from(payload, "utf8").toString("base64"), isBase64Encoded: true }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      status: "writing",
      writeSessionId: "w-b64",
    });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("anthropic"))).toBe(false);
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

  it("loads Ann’s voice when that personality is selected", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("quick_research")) {
        return {
          ok: true,
          json: async () => ({
            query: "Gagne",
            round: 1,
            status: "done",
            findings: [],
            gaps: [],
            followUpQueries: [],
          }),
        };
      }
      if (String(url).includes("/chat/write/start")) {
        return { ok: true, json: async () => ({ writeSessionId: "w-ann", status: "writing" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "scoping",
          personality: "ann",
          messages: [{ role: "user", content: "What do I have on Gagne?" }],
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    const start = fetchImpl.mock.calls.find(([url]) => String(url).includes("/chat/write/start"));
    const body = JSON.parse(String((start?.[1] as RequestInit).body));
    expect(body.system).toContain("Ann O’Tation");
    expect(body.system).toContain("note-edit");
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

  it("does not fall back to Anthropic on Netlify when the Worker write route is missing", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("quick_research")) {
        return {
          ok: true,
          json: async () => ({
            query: "Gagne",
            round: 1,
            status: "done",
            findings: [],
            gaps: [],
            followUpQueries: [],
          }),
        };
      }
      if (String(url).includes("/chat/write/start")) {
        return { ok: false, status: 404, json: async () => ({ error: "Not found" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body ?? "{}").error).toMatch(/not deployed/i);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("anthropic"))).toBe(false);
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

  it("hands From a book to the Worker write clock with web_search, not Netlify Anthropic", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/chat/write/start")) {
        const body = JSON.parse(String(init?.body));
        expect(body.webSearch).toBe(true);
        expect(body.system).toContain("From a book protocol");
        expect(body.system).toContain("Reading: Make It Stick (p. 142)");
        expect(body.system).toMatch(/open web/i);
        expect(body.maxTokens).toBeGreaterThan(2000);
        return { ok: true, json: async () => ({ writeSessionId: "w-book", status: "writing" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "fromBook",
          bookContext: { label: "Make It Stick", locus: "p. 142" },
          messages: [{ role: "user", content: "desirable difficulties" }],
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      status: "writing",
      writeSessionId: "w-book",
    });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("anthropic"))).toBe(false);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/deep_research"))).toBe(false);
  });
});
