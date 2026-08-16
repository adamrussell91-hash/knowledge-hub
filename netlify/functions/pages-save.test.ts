import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./pages-save";
import { signSession } from "./_lib/session";

vi.mock("./_lib/savePageRecord", () => ({
  savePageRecord: vi.fn(async (page: { id: string }) => page),
}));

const secret = "session-secret";
const hubPage = {
  id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  title: "New note",
  area: "notes",
  tags: [],
  body: "Hello",
  attachments: [],
  source: "hub",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
  schema_version: 1,
};

function event(overrides: { cookie?: boolean; body?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: "POST",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? JSON.stringify(hubPage),
  };
}

describe("pages-save", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
    process.env.GITHUB_DATA_REPO = "owner/repo";
    process.env.GITHUB_DATA_REPO_TOKEN = "tok";
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.GITHUB_DATA_REPO;
    delete process.env.GITHUB_DATA_REPO_TOKEN;
    vi.clearAllMocks();
  });

  it("requires a session", async () => {
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("rejects an empty title", async () => {
    const response = await handler(
      event({ body: JSON.stringify({ ...hubPage, title: "  " }) }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("Title is required");
  });

  it("returns 503 when the data repo token is missing", async () => {
    delete process.env.GITHUB_DATA_REPO_TOKEN;
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(503);
  });

  it("saves a valid hub page", async () => {
    const { savePageRecord } = await import("./_lib/savePageRecord");
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(savePageRecord).toHaveBeenCalled();
  });
});
