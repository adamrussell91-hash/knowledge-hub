import { describe, expect, it, vi } from "vitest";
import { savePageRecord } from "./savePageRecord";
import { GitHubWriteError } from "./githubWrite";
import type { Page } from "../../../src/domain/page";

const page: Page = {
  id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  title: "New note",
  area: "notes",
  tags: [],
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
    const manifest = JSON.parse(putContent.mock.calls[1]?.[1] as string) as { id: string }[];
    expect(manifest[0]?.id).toBe(page.id);
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
