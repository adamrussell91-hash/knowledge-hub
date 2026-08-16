import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./quiz-get";
import { signSession } from "./_lib/session";

vi.mock("./_lib/githubWrite", () => ({
  getContent: vi.fn(async () => null),
  GitHubWriteError: class GitHubWriteError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

const secret = "session-secret";

function event(cookie = true) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: "GET",
    headers: cookie ? { cookie: `kh_session=${token}` } : {},
    path: "/api/quiz",
  };
}

describe("quiz-get", () => {
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
    const response = await handler(event(false) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("returns an empty schedule when the file is missing", async () => {
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toEqual({ schema_version: 1, schedule: [], edges: [], dumps: [] });
  });
});
