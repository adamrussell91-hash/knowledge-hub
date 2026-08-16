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
});
