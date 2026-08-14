import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPage, listPages, runCoach } from "./client";
import { API_BASE } from "./config";

describe("api client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists pages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "p" }] }));
    await expect(listPages()).resolves.toEqual([{ id: "p" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pages"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("gets a page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "p" }) }));
    await expect(getPage("p")).resolves.toEqual({ id: "p" });
  });

  it("posts coach turns to the session API without a kernel secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ reply: "State the claim.", research: { findings: [] } }),
      }),
    );
    await expect(
      runCoach({
        messages: [{ role: "user", content: "Help" }],
        workingThesis: "A claim",
        draft: "Draft text",
      }),
    ).resolves.toMatchObject({ reply: "State the claim." });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/clementine-coach"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(String(init.body)).toContain("A claim");
    expect(String(init.body)).not.toMatch(/kernel/i);
    expect(JSON.stringify(init.headers)).not.toMatch(/x-research-kernel-secret/i);
  });
});

it("uses the same-origin API route by default", () => expect(API_BASE).toBe("/api"));
