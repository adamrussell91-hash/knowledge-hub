import { describe, expect, it } from "vitest";
import { PageManifestEntrySchema, PageSchema, newHubPageId, parseTagList } from "./page";

const validPage = {
  id: "page_notion_abc123",
  title: "Stoicism and modern CBT",
  area: "notes",
  tags: ["philosophy", "psychology"],
  body: "# Stoicism\n\nSome content.",
  attachments: [],
  source_notion_id: "abc123",
  source_notion_url: "https://notion.so/abc123",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
  schema_version: 1,
};

describe("PageSchema", () => {
  it("accepts a valid page", () => {
    expect(PageSchema.parse(validPage)).toEqual({ ...validPage, connected: [] });
  });

  it("rejects an unknown area", () => {
    expect(() => PageSchema.parse({ ...validPage, area: "not-a-real-area" })).toThrow();
  });

  it("defaults omitted connected links to an empty list", () => {
    expect(PageSchema.parse(validPage).connected).toEqual([]);
  });

  it("keeps provided connected page ids", () => {
    expect(PageSchema.parse({ ...validPage, connected: ["page_b"] }).connected).toEqual(["page_b"]);
  });

  it("accepts a hub page without Notion fields", () => {
    expect(
      PageSchema.parse({
        id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        title: "New note",
        area: "notes",
        tags: ["Educational Psychology"],
        body: "Body",
        attachments: [],
        source: "hub",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
        schema_version: 1,
      }).source,
    ).toBe("hub");
  });

  it("rejects a notion page missing source_notion_url", () => {
    const { source_notion_url: _drop, ...rest } = validPage;
    expect(() => PageSchema.parse(rest)).toThrow();
  });

  it("accepts an audio attachment on a hub page", () => {
    expect(
      PageSchema.parse({
        ...validPage,
        attachments: [
          {
            id: "attachment_audio1",
            kind: "audio",
            r2_key: "notes/page_hub_aa/voice.webm",
            filename: "voice.webm",
            content_type: "audio/webm",
          },
        ],
      }).attachments[0]?.kind,
    ).toBe("audio");
  });
});

describe("PageManifestEntrySchema", () => {
  it("accepts a row without created_at", () => {
    expect(
      PageManifestEntrySchema.parse({
        id: "p",
        title: "Title",
        area: "notes",
        tags: [],
        excerpt: "Summary",
      }),
    ).toEqual({
      id: "p",
      title: "Title",
      area: "notes",
      tags: [],
      excerpt: "Summary",
    });
  });

  it("keeps created_at when present", () => {
    expect(
      PageManifestEntrySchema.parse({
        id: "p",
        title: "Title",
        area: "notes",
        tags: [],
        excerpt: "Summary",
        created_at: "2024-01-01T00:00:00.000Z",
      }).created_at,
    ).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("newHubPageId", () => {
  it("strips dashes from a uuid", () => {
    expect(newHubPageId(() => "550e8400-e29b-41d4-a716-446655440000")).toBe(
      "page_hub_550e8400e29b41d4a716446655440000",
    );
  });
});

describe("parseTagList", () => {
  it("trims, drops empties, and dedupes", () => {
    expect(parseTagList(" Pedagogy , Pedagogy,  Wellbeing ,")).toEqual(["Pedagogy", "Wellbeing"]);
  });
});
