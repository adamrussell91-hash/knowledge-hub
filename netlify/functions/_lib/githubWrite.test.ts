import { afterEach, describe, expect, it, vi } from "vitest";
import { getContent, putContent } from "./githubWrite";

describe("githubWrite", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when the file is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(getContent("owner/repo", "token", "pages/a.json")).resolves.toBeNull();
  });

  it("decodes file text and sha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sha: "abc", encoding: "base64", content: Buffer.from('{"id":"p"}').toString("base64") }),
      }),
    );
    await expect(getContent("owner/repo", "token", "pages/p.json")).resolves.toEqual({
      sha: "abc",
      text: '{"id":"p"}',
    });
  });

  it("sends sha on update and throws on 409", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => "conflict" });
    vi.stubGlobal("fetch", fetchImpl);
    await expect(putContent("owner/repo", "token", "manifest.json", "[]", "oldsha")).rejects.toMatchObject({
      status: 409,
    });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body)).sha).toBe("oldsha");
  });

  it("reads oversized files via the Git blob API when Contents has no payload", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/git/blobs/abc")) {
        return { ok: true, status: 200, text: async () => '[{"id":"p"}]', json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: "abc", encoding: "none", content: "", size: 1_775_327 }),
      };
    });
    vi.stubGlobal("fetch", fetchImpl);
    await expect(getContent("owner/repo", "token", "manifest.json")).resolves.toEqual({
      sha: "abc",
      text: '[{"id":"p"}]',
    });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/git/blobs/abc");
  });

  it("writes oversized files through the Git Data API", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (href.endsWith("/repos/owner/repo") && method === "GET") {
        return { ok: true, json: async () => ({ default_branch: "main" }) };
      }
      if (href.includes("/contents/manifest.json") && method === "GET") {
        return { ok: true, json: async () => ({ sha: "oldblob" }) };
      }
      if (href.includes("/git/ref/heads/main")) {
        return { ok: true, json: async () => ({ object: { sha: "commit1" } }) };
      }
      if (href.includes("/git/commits/commit1")) {
        return { ok: true, json: async () => ({ tree: { sha: "tree1" } }) };
      }
      if (href.endsWith("/git/blobs") && method === "POST") {
        return { ok: true, json: async () => ({ sha: "newblob" }) };
      }
      if (href.endsWith("/git/trees") && method === "POST") {
        return { ok: true, json: async () => ({ sha: "tree2" }) };
      }
      if (href.endsWith("/git/commits") && method === "POST") {
        return { ok: true, json: async () => ({ sha: "commit2" }) };
      }
      if (href.includes("/git/refs/heads/main") && method === "PATCH") {
        return { ok: true, json: async () => ({}) };
      }
      throw new Error(`unexpected ${method} ${href}`);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const text = "n".repeat(1_000_000);
    await putContent("owner/repo", "token", "manifest.json", text, "oldblob", "Upsert page");
    const blobCall = fetchImpl.mock.calls.find(call => String(call[0]).endsWith("/git/blobs"));
    expect(JSON.parse(String((blobCall?.[1] as RequestInit).body))).toMatchObject({ encoding: "utf-8" });
    expect(fetchImpl.mock.calls.some(call => (call[1] as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });
});
