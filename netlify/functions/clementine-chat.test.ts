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

  it("writes a from-a-book page with the book in the brief", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/chat/write/start")) {
        return { ok: true, json: async () => ({ writeSessionId: "w-book", status: "writing" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await handler(
      event({
        body: JSON.stringify({
          hat: "fromBook",
          compose: true,
          bookContext: { label: "Make It Stick", locus: "p. 142" },
          messages: [{ role: "user", content: "desirable difficulties" }],
          priorResearch: {
            query: "desirable difficulties",
            round: 1,
            status: "done",
            findings: [
              {
                pageId: "page_bjork",
                title: "Bjork on retrieval effort",
                sourceUrl: "https://example.test/b",
                excerpt: "Effortful retrieval strengthens later recall",
                stance: "supports",
                analysis: "Supports the book.",
                confidence: "high",
                claimRelationship: "direct",
              },
            ],
            gaps: [],
            followUpQueries: [],
          },
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    const start = fetchImpl.mock.calls.find(([url]) => String(url).includes("/chat/write/start"));
    const body = JSON.parse(String((start?.[1] as RequestInit).body));
    expect(body.system).toContain("From a book protocol");
    expect(body.system).toContain("Reading: Make It Stick (p. 142)");
    expect(body.system).toContain("How this bears on the book");
    expect(body.maxTokens).toBeGreaterThan(2000);
  });
});
