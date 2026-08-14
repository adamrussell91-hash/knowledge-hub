import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./clementine-coach";
import { signSession } from "./_lib/session";

const secret = "session-secret";
const kernelSecret = "kernel-secret-value";

function event(overrides: { cookie?: boolean; body?: string; method?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: overrides.method ?? "POST",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? JSON.stringify({ messages: [{ role: "user", content: "What am I arguing?" }] }),
  };
}

describe("clementine-coach handler", () => {
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
    vi.unstubAllGlobals();
  });

  it("requires a site session", async () => {
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("calls the kernel with the shared secret and never returns it to the client", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("quick_research")) {
        return {
          ok: true,
          json: async () => ({
            query: "What am I arguing?",
            round: 1,
            status: "done",
            findings: [
              {
                pageId: "p1",
                title: "T",
                sourceUrl: "https://example.test/p1",
                excerpt: "e",
                stance: "related",
                analysis: "why",
              },
            ],
            gaps: [],
            followUpQueries: [],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "State the claim without hedging." }] }),
      };
    });
    vi.stubGlobal("fetch", fetchImpl);

    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body ?? "{}") as { reply: string; research?: { findings: { pageId: string }[] } };
    expect(payload.reply).toContain("State the claim");
    expect(payload.research?.findings[0]?.pageId).toBe("p1");
    expect(response.body).not.toContain(kernelSecret);
    expect(JSON.stringify(payload)).not.toContain(kernelSecret);

    const kernelCall = fetchImpl.mock.calls.find(([url]) => String(url).includes("quick_research"));
    expect(kernelCall).toBeTruthy();
    const init = kernelCall?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-research-kernel-secret"]).toBe(kernelSecret);
  });
});
