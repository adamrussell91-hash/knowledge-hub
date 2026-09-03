import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_NEEDS_NETLIFY, runCapture } from "./captureClient";

describe("runCapture", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts r2_key to /capture with credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "spoken" }) }));
    await expect(runCapture("notes/page_hub_aa/voice.webm")).resolves.toEqual({ text: "spoken" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/capture"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ r2_key: "notes/page_hub_aa/voice.webm" });
    expect(JSON.stringify(init.headers)).not.toMatch(/x-research-kernel-secret/i);
  });

  it("unwraps a Life capture envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { text: "spoken" } }) }),
    );
    await expect(runCapture("notes/page_hub_aa/voice.webm")).resolves.toEqual({ text: "spoken" });
  });

  it("throws in local data mode without fetching", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    await expect(runCapture("notes/page_hub_aa/voice.webm", { localData: true })).rejects.toThrow(
      CAPTURE_NEEDS_NETLIFY,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
