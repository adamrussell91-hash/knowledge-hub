import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPage, listPages, runCoach, savePage, signAttachment } from "./client";
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

  it("posts page saves with credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "page_hub_x" }) }));
    await expect(savePage({ id: "page_hub_x" } as never)).resolves.toMatchObject({ id: "page_hub_x" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pages-save"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("posts attachment sign requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ put_url: "https://r2", attachment: { id: "a" } }),
      }),
    );
    await expect(
      signAttachment({
        filename: "a.pdf",
        content_type: "application/pdf",
        byte_size: 10,
        page_id: "page_hub_x",
        area: "notes",
      }),
    ).resolves.toMatchObject({ put_url: "https://r2" });
  });
});

it("uses the same-origin API route by default", () => expect(API_BASE).toBe("/api"));
