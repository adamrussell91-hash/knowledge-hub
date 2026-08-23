import { describe, expect, it } from "vitest";
import type { Page, PageManifestEntry } from "../src/domain/page";
import { syncManifestOrigins } from "./stamp-origins";
import { closedTopicCoverage, parseSyncManifestArgs, tagDrift } from "./sync-manifest-from-pages";

const page = (overrides: Partial<Page> = {}): Page => ({
  id: "page_notion_abc",
  title: "Lecture",
  area: "notes",
  tags: ["Note", "Learning Science and Cognition"],
  body: "A cleaned lecture body.",
  connected: [],
  attachments: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

describe("sync manifest from pages", () => {
  it("parses CLI flags", () => {
    expect(parseSyncManifestArgs(["--data-dir", "data-repo", "--execute"])).toEqual({
      dataDir: "data-repo",
      execute: true,
    });
  });

  it("copies closed topic tags from the page file onto a stale list row", () => {
    const ready = page();
    const [row] = syncManifestOrigins(
      [{ id: ready.id, title: "Old title", area: "notes", tags: ["Educational Psychology"], excerpt: "Old." }],
      [ready],
    );
    expect(row?.title).toBe("Lecture");
    expect(row?.tags).toEqual(["Note", "Learning Science and Cognition"]);
    expect(row?.excerpt).toBe("A cleaned lecture body.");
  });

  it("counts notes the list would treat as untagged even when the page file is tagged", () => {
    const tagged = page();
    const stale: PageManifestEntry = {
      id: tagged.id,
      title: tagged.title,
      area: tagged.area,
      tags: ["Educational Psychology"],
      excerpt: "Old.",
    };
    expect(closedTopicCoverage([tagged])).toEqual({ total: 1, withClosedTopics: 1, withoutClosedTopics: 0 });
    expect(closedTopicCoverage([stale])).toEqual({ total: 1, withClosedTopics: 0, withoutClosedTopics: 1 });
    expect(tagDrift([stale], [tagged])).toEqual({ matched: 0, pageAhead: 1, listAhead: 0, missingPage: 0 });
  });
});
