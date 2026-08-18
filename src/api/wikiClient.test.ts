import { beforeEach, describe, expect, it, vi } from "vitest";
import { curatorAction, listCuratorPending } from "./wikiClient";

describe("wiki client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists pending proposals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pending: [{ id: "a||b" }] }) }),
    );
    await expect(listCuratorPending()).resolves.toEqual([{ id: "a||b" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/curator"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("posts approve and run actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pending: [] }) }));
    await expect(curatorAction("approve", "a||b")).resolves.toEqual({ pending: [] });
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("approve");
    expect(String(init.body)).toContain("a||b");
  });

  it("surfaces the API error body instead of a bare status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "workflow dispatch failed 404" }),
      }),
    );
    await expect(listCuratorPending()).rejects.toThrow("workflow dispatch failed 404");
  });
});
