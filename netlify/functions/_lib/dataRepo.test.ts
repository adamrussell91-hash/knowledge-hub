import { describe, expect, it } from "vitest";
import { toManifestEntry } from "./dataRepo";
import type { Page } from "../../../src/domain/page";
const page: Page = { id: "p", title: "Title", area: "notes", tags: [], body: "# Heading\n\nText content", attachments: [], source_notion_id: "p", source_notion_url: "https://notion.so/p", created_at: "2024-01-01T00:00:00.000Z", updated_at: "2024-01-01T00:00:00.000Z", schema_version: 1 };
describe("toManifestEntry", () => it("removes markdown headings", () => expect(toManifestEntry(page).excerpt).toBe("Text content")));
