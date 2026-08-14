import { describe, expect, it } from "vitest";
import { buildIndex, buildLexicalCorpus, excerptFromBody } from "./build-index";

describe("buildIndex", () => {
  it("keeps page metadata and vectors together across batches", async () => {
    const pages = [
      {
        id: "p1",
        title: "T1",
        body: "# T1\n\nExcerpt one",
        area: "notes" as const,
        tags: ["A"],
        attachments: [],
        source_notion_id: "p1",
        source_notion_url: "https://notion.so/p1",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        schema_version: 1 as const,
      },
      {
        id: "p2",
        title: "T2",
        body: "# T2\n\nExcerpt two",
        area: "university" as const,
        tags: ["B"],
        attachments: [],
        source_notion_id: "p2",
        source_notion_url: "https://notion.so/p2",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        schema_version: 1 as const,
      },
    ];

    const seen: string[] = [];
    await expect(
      buildIndex(pages, async texts => {
        seen.push(...texts);
        return texts.map((_, index) => [index + 1, index + 2]);
      }),
    ).resolves.toEqual([
      { pageId: "p1", title: "T1", excerpt: "Excerpt one", vector: [1, 2] },
      { pageId: "p2", title: "T2", excerpt: "Excerpt two", vector: [2, 3] },
    ]);
    expect(seen[0]).toBe("T1\n\nExcerpt one");
    expect(seen[0]).not.toContain("# T1");

    expect(excerptFromBody("# Title\n\nHello world")).toBe("Hello world");
    expect(buildLexicalCorpus(pages)[0]).toMatchObject({
      pageId: "p1",
      tags: ["A"],
      area: "notes",
    });
  });
});
