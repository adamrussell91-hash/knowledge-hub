import { afterEach, describe, expect, it } from "vitest";
import { pullLiveArchive, resetLiveArchiveCache } from "./liveArchive";

describe("pullLiveArchive", () => {
  afterEach(() => {
    resetLiveArchiveCache();
    delete process.env.GITHUB_DATA_REPO;
    delete process.env.GITHUB_DATA_REPO_TOKEN;
  });

  it("finds fixture notes for a scoping question", async () => {
    const result = await pullLiveArchive({ query: "what do I have on stoicism", k: 8 });
    expect(result.findings[0]?.pageId).toBe("page_stoicism");
    expect(result.findings[0]?.title).toMatch(/stoicism/i);
  });
});
