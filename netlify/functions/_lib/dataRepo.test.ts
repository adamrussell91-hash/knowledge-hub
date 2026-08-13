import { describe, expect, it } from "vitest";
import { githubNetworkError, parseManifest, toManifestEntry } from "./dataRepo";
import type { Page } from "../../../src/domain/page";
const page: Page = { id: "p", title: "Title", area: "notes", tags: [], body: "# Heading\n\nText content", attachments: [], source_notion_id: "p", source_notion_url: "https://notion.so/p", created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", schema_version: 1 };
describe("toManifestEntry", () => it("removes markdown headings", () => expect(toManifestEntry(page).excerpt).toBe("Text content")));
describe("githubNetworkError", () => it("preserves the underlying network cause", () => expect(githubNetworkError(Object.assign(new TypeError("fetch failed"), { cause: new Error("connect ETIMEDOUT") })).message).toContain("connect ETIMEDOUT")));
describe("parseManifest", () => it("accepts page metadata without fetching every body", () => expect(parseManifest([{ id: "p", title: "Title", area: "notes", tags: [], excerpt: "Summary", path: "pages/p.json" }])).toEqual([{ id: "p", title: "Title", area: "notes", tags: [], excerpt: "Summary", path: "pages/p.json" }])));
