import { describe, expect, it } from "vitest";
import { PageSchema } from "./page";

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
    expect(PageSchema.parse(validPage)).toEqual(validPage);
  });

  it("rejects an unknown area", () => {
    expect(() => PageSchema.parse({ ...validPage, area: "not-a-real-area" })).toThrow();
  });
});
