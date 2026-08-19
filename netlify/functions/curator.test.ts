import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./curator";
import { signSession } from "./_lib/session";

vi.mock("./_lib/githubWrite", () => ({
  GitHubWriteError: class GitHubWriteError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  getContent: vi.fn(),
  putContent: vi.fn(),
}));

const secret = "session-secret";
const proposal = {
  id: "a||b",
  noteA: "a",
  noteB: "b",
  titleA: "A",
  titleB: "B",
  excerptA: "ea",
  excerptB: "eb",
  relation: "related",
  rationale: "same thread",
  proposedAt: "2026-08-15T00:00:00.000Z",
};

function event(overrides: { method?: string; cookie?: boolean; body?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: overrides.method ?? "GET",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body,
  };
}

function pageJson(id: string) {
  return JSON.stringify({
    id,
    title: id.toUpperCase(),
    area: "notes",
    tags: [],
    body: "Body",
    connected: [],
    attachments: [],
    source_notion_id: id,
    source_notion_url: `https://notion.so/${id}`,
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-15T00:00:00.000Z",
    schema_version: 1,
  });
}

describe("curator function", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
    process.env.GITHUB_DATA_REPO = "owner/data";
    process.env.GITHUB_DATA_REPO_TOKEN = "tok";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.GITHUB_DATA_REPO;
    delete process.env.GITHUB_DATA_REPO_TOKEN;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("requires a session", async () => {
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("lists pending proposals", async () => {
    const { getContent } = await import("./_lib/githubWrite");
    vi.mocked(getContent).mockImplementation(async (_repo, _token, file) => {
      if (file.includes("pending")) return { sha: "p", text: JSON.stringify([proposal]) };
      return { sha: "d", text: "[]" };
    });
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("same thread");
  });

  it("approves a proposal onto both pages", async () => {
    const { getContent, putContent } = await import("./_lib/githubWrite");
    vi.mocked(getContent).mockImplementation(async (_repo, _token, file) => {
      if (file.includes("pending")) return { sha: "p", text: JSON.stringify([proposal]) };
      if (file.includes("dismissed")) return { sha: "d", text: "[]" };
      if (file.includes("/a.json")) return { sha: "a", text: pageJson("a") };
      if (file.includes("/b.json")) return { sha: "b", text: pageJson("b") };
      return null;
    });
    const response = await handler(
      event({ method: "POST", body: JSON.stringify({ action: "approve", id: "a||b" }) }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    const writes = vi.mocked(putContent).mock.calls.map(call => call[2]);
    expect(writes).toContain("pages/a.json");
    expect(writes).toContain("pages/b.json");
    const pageA = JSON.parse(vi.mocked(putContent).mock.calls.find(call => call[2] === "pages/a.json")?.[3] as string) as {
      connected: string[];
    };
    expect(pageA.connected).toEqual(["b"]);
  });

  it("returns an empty queue when curator files are missing", async () => {
    const { getContent } = await import("./_lib/githubWrite");
    vi.mocked(getContent).mockResolvedValue(null);
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toEqual({ pending: [] });
  });

  it("includes the GitHub dispatch body when Run now fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '{"message":"Not Found"}',
      }),
    );
    const response = await handler(
      event({ method: "POST", body: JSON.stringify({ action: "run" }) }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(502);
    expect(response.body).toContain("workflow dispatch failed 404");
    expect(response.body).toContain("Not Found");
  });

  it("queues a curator workflow on run", async () => {
    const response = await handler(
      event({ method: "POST", body: JSON.stringify({ action: "run" }) }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/actions/workflows/curator.yml/dispatches"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
