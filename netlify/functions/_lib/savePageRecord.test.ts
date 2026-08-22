import { describe, expect, it, vi } from "vitest";
import { savePageRecord } from "./savePageRecord";
import { GitHubWriteError } from "./githubWrite";
import type { Page } from "../../../src/domain/page";

const page: Page = {
  id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  title: "New note",
  area: "notes",
  tags: [],
  origins: [{ kind: "unit", label: "EDST5805" }],
  body: "Hello",
  connected: [],
  attachments: [],
  source: "hub",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
  schema_version: 1,
};

describe("savePageRecord", () => {
  it("writes the page then upserts the manifest", async () => {
    const getContent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sha: "man1", text: "[]" });
    const putContent = vi.fn().mockResolvedValue(undefined);
    const saved = await savePageRecord(page, { getContent, putContent });
    expect(saved.id).toBe(page.id);
    expect(putContent.mock.calls[0]?.[0]).toBe("pages/page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json");
    expect(putContent.mock.calls[1]?.[0]).toBe("manifest.json");
    const manifest = JSON.parse(putContent.mock.calls[1]?.[1] as string) as {
      id: string;
      origins?: { kind: string; label: string }[];
    }[];
    expect(manifest[0]?.id).toBe(page.id);
    expect(manifest[0]?.origins).toEqual([{ kind: "unit", label: "EDST5805" }]);
  });

  it("keeps origins already on GitHub when the client omits them", async () => {
    const existing = { ...page, origins: [{ kind: "degree" as const, label: "MEd" }, { kind: "unit" as const, label: "EDST5805" }] };
    const { origins: _omit, ...withoutOrigins } = page;
    const getContent = vi
      .fn()
      .mockResolvedValueOnce({ sha: "page1", text: JSON.stringify(existing) })
      .mockResolvedValueOnce({ sha: "man1", text: "[]" });
    const putContent = vi.fn().mockResolvedValue(undefined);
    await savePageRecord(withoutOrigins as Page, { getContent, putContent });
    const written = JSON.parse(putContent.mock.calls[0]?.[1] as string) as Page;
    expect(written.origins).toEqual(existing.origins);
  });

  it("retries the manifest once on 409 then succeeds", async () => {
    const getContent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sha: "old", text: "[]" })
      .mockResolvedValueOnce({ sha: "new", text: "[]" });
    const putContent = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new GitHubWriteError("conflict", 409))
      .mockResolvedValueOnce(undefined);
    await savePageRecord(page, { getContent, putContent });
    expect(putContent).toHaveBeenCalledTimes(3);
  });

  it("throws 409 after a second manifest collision", async () => {
    const getContent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sha: "a", text: "[]" })
      .mockResolvedValueOnce({ sha: "b", text: "[]" });
    const putContent = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new GitHubWriteError("conflict", 409));
    await expect(savePageRecord(page, { getContent, putContent })).rejects.toMatchObject({
      status: 409,
    });
  });
});
