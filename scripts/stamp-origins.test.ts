import { describe, expect, it } from "vitest";
import type { Page } from "../src/domain/page";
import {
  applyStampedOrigins,
  extraOriginEntries,
  originKindCounts,
  parseStampArgs,
  stampOrigins,
  syncManifestOrigins,
} from "./stamp-origins";

const page = (overrides: Partial<Page> = {}): Page => ({
  id: "page_notion_abc",
  title: "Lecture",
  area: "notes",
  tags: ["Note", "EDST5805"],
  body: "Degree: MEd\n\nBody.",
  connected: [],
  attachments: [],
  source_notion_id: "13ef794f84768078bbe7d30d66a8709c",
  source_notion_url: "https://notion.so/13ef794f84768078bbe7d30d66a8709c",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

describe("stamp origins", () => {
  it("parses CLI flags", () => {
    expect(parseStampArgs(["--data-dir", "data-repo", "--from-notion", "--execute", "--count", "20"])).toEqual({
      dataDir: "data-repo",
      fromNotion: true,
      execute: true,
      count: 20,
    });
  });

  it("stamps notebook, book, and PD from the committed Notion snapshot", () => {
    expect(
      applyStampedOrigins(
        page({
          tags: ["Note"],
          body: "Lecture.",
          source_notion_id: "163f794f84768001aebffe92627dc423",
        }),
      )?.origins,
    ).toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
    expect(
      applyStampedOrigins(
        page({
          id: "page_notion_163f794f84768001aebffe92627dc423",
          tags: ["Note"],
          body: "Lecture.",
          source_notion_id: "page_notion_163f794f84768001aebffe92627dc423",
        }),
      )?.origins,
    ).toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
  });

  it("counts how many pages carry each origin kind", () => {
    expect(
      originKindCounts([
        { origins: [{ kind: "notebook", label: "Literacy" }, { kind: "book", label: "Atomic Habits" }] },
        { origins: [{ kind: "notebook", label: "Literacy" }] },
        { origins: [{ kind: "unit", label: "EDST5805" }] },
      ]),
    ).toEqual({ degree: 0, unit: 1, notebook: 2, book: 1, pd: 0 });
  });

  it("stamps degree and unit from body and tags without Notion", () => {
    expect(applyStampedOrigins(page())?.origins).toEqual([
      { kind: "degree", label: "Master of Education (Gifted Education)" },
      { kind: "degree", label: "MEd" },
      { kind: "unit", label: "EDST5805" },
    ]);
  });

  it("renames the Newcastle graduate certificate and does not restore the UNE diploma", () => {
    expect(
      applyStampedOrigins(
        page({
          tags: ["EDUC6119"],
          body: "Lecture.",
          origins: [
            { kind: "degree", label: "Transformational Leadership Certificate" },
            { kind: "degree", label: "Graduate Diploma of Psychology" },
            { kind: "unit", label: "EDUC6119" },
          ],
        }),
      )?.origins,
    ).toEqual([
      { kind: "degree", label: "Graduate Certificate in Transformational Leadership" },
      { kind: "unit", label: "EDUC6119" },
    ]);
  });

  it("copies existing page pills onto a list row that never got them", () => {
    const ready = page({
      id: "page_notion_00c518fb7b884781a60f702ec3185eb3",
      origins: [{ kind: "notebook", label: "Boy's Education" }],
    });
    expect(
      syncManifestOrigins(
        [{ id: ready.id, title: ready.title, area: ready.area, tags: ready.tags, excerpt: "Lecture." }],
        [ready],
      )[0]?.origins,
    ).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });

  it("copies tidied topic tags from the page file onto a stale list row", () => {
    const ready = page({
      id: "page_notion_00c518fb7b884781a60f702ec3185eb3",
      tags: ["Note", "Learning Science and Cognition"],
      body: "A cleaned lecture body.",
    });
    expect(
      syncManifestOrigins(
        [{ id: ready.id, title: "Old", area: ready.area, tags: ["Educational Psychology"], excerpt: "Old." }],
        [ready],
      )[0],
    ).toMatchObject({
      title: "Lecture",
      tags: ["Note", "Learning Science and Cognition"],
      excerpt: "A cleaned lecture body.",
    });
  });

  it("appends notebook pages that exist as files but never reached the list", () => {
    const ready = page({
      id: "page_notion_00c518fb7b884781a60f702ec3185eb3",
      origins: [{ kind: "notebook", label: "Boy's Education" }],
    });
    const extra = extraOriginEntries(
      [{ id: "page_notion_live", title: "Live", area: "notes", tags: ["Note"], excerpt: "On the list." }],
      [ready],
    );
    expect(extra).toHaveLength(1);
    expect(extra[0]?.id).toBe(ready.id);
    expect(extra[0]?.origins).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });

  it("matches a list row whose id is a dashed Notion UUID", () => {
    const ready = page({
      id: "page_notion_00c518fb7b884781a60f702ec3185eb3",
      origins: [{ kind: "notebook", label: "Boy's Education" }],
    });
    expect(
      syncManifestOrigins(
        [
          {
            id: "00c518fb-7b88-4781-a60f-702ec3185eb3",
            title: ready.title,
            area: ready.area,
            tags: ready.tags,
            excerpt: "Lecture.",
          },
        ],
        [ready],
      )[0]?.origins,
    ).toEqual([{ kind: "notebook", label: "Boy's Education" }]);
  });

  it("leaves a page unchanged when origins are already complete", () => {
    expect(
      applyStampedOrigins(
        page({
          origins: [
            { kind: "degree", label: "Master of Education (Gifted Education)" },
            { kind: "degree", label: "MEd" },
            { kind: "unit", label: "EDST5805" },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("merges Notion properties when asked", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({
        properties: {
          Notebook: { type: "select", select: { name: "Brown 2022" } },
        },
      }),
    })) as unknown as typeof fetch;
    const changed = await stampOrigins({
      pages: [page()],
      fromNotion: true,
      token: "secret",
      fetchImpl,
    });
    expect(changed[0]?.origins).toEqual([
      { kind: "degree", label: "Master of Education (Gifted Education)" },
      { kind: "degree", label: "MEd" },
      { kind: "notebook", label: "Brown 2022" },
      { kind: "unit", label: "EDST5805" },
    ]);
  });
});
