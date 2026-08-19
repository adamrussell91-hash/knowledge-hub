import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "./_lib/session";

vi.mock("../../src/tidy/githubIo", () => ({
  tidyPageOnGitHub: vi.fn(async ({ id }: { id: string }) => ({ id, title: "Tidied" })),
}));
vi.mock("../../src/clementine/loadFromDisk", () => ({
  loadPromptFile: vi.fn(() => "tidy prompt"),
}));

const secret = "session-secret";

function event(overrides: { cookie?: boolean; body?: string; method?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: overrides.method ?? "POST",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? JSON.stringify({ id: "page_hub_p" }),
  };
}

describe("tidy function", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
    process.env.GITHUB_DATA_REPO = "owner/repo";
    process.env.GITHUB_DATA_REPO_TOKEN = "tok";
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.GITHUB_DATA_REPO;
    delete process.env.GITHUB_DATA_REPO_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    vi.clearAllMocks();
  });

  it("requires a session", async () => {
    const { handler } = await import("./tidy");
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("requires an id", async () => {
    const { handler } = await import("./tidy");
    const response = await handler(event({ body: "{}" }) as never, {} as never);
    expect(response.statusCode).toBe(400);
  });

  it("tidies the posted page after a valid session", async () => {
    const { handler } = await import("./tidy");
    const { tidyPageOnGitHub } = await import("../../src/tidy/githubIo");
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({ id: "page_hub_p" });
    expect(tidyPageOnGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ id: "page_hub_p", repo: "owner/repo", token: "tok", apiKey: "sk-test" }),
    );
  });
});
