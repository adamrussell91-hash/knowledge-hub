import { describe, expect, it } from "vitest";
import { githubNetworkError, parseManifest, toManifestEntry } from "./dataRepo";
import type { Page } from "../../../src/domain/page";
const page: Page = { id: "p", title: "Title", area: "notes", tags: [], body: "# Heading\n\nText content", connected: [], attachments: [], source_notion_id: "p", source_notion_url: "https://notion.so/p", created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", schema_version: 1 };
describe("toManifestEntry", () => {
  it("removes markdown headings", () => expect(toManifestEntry(page).excerpt).toBe("Text content"));
  it("copies created_at onto the manifest row", () => {
    expect(toManifestEntry(page).created_at).toBe("2024-01-01T00:00:00.000Z");
  });
  it("copies origin pills onto the manifest row", () => {
    expect(toManifestEntry({ ...page, origins: [{ kind: "notebook", label: "Brown 2022" }] }).origins).toEqual([
      { kind: "notebook", label: "Brown 2022" },
    ]);
  });
  it("recovers notebook pills from a page_notion id", () => {
    expect(
      toManifestEntry({ ...page, id: "page_notion_00c518fb7b884781a60f702ec3185eb3" }).origins,
    ).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });
});
describe("githubNetworkError", () => it("preserves the underlying network cause", () => expect(githubNetworkError(Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ETIMEDOUT") })).message).toContain("connect ETIMEDOUT")));
describe("parseManifest", () => it("accepts page metadata without fetching every body", () => expect(parseManifest([{ id: "p", title: "Title", area: "notes", tags: [], excerpt: "Summary", origins: [{ kind: "unit", label: "EDST5805" }], path: "pages/p.json" }])).toEqual([{ id: "p", title: "Title", area: "notes", tags: [], excerpt: "Summary", origins: [{ kind: "unit", label: "EDST5805" }], path: "pages/p.json" }])));
