import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { splitLeftoverPage, splitMarkdown } from "./split";

const headingNote = [
  "# One\n\n",
  `${"alpha ".repeat(80)}\n\n`,
  "# Two\n\n",
  `${"bravo ".repeat(80)}\n\n`,
  "# Three\n\n",
  `${"charlie ".repeat(80)}\n\n`,
  "# Four\n\n",
  `${"delta ".repeat(80)}`,
].join("");

const page = (overrides: Partial<Page> = {}): Page => ({
  id: "page_notion_long",
  title: "Long lecture",
  area: "notes",
  tags: ["Note", "EDST5321"],
  origins: [{ kind: "unit", label: "EDST5321" }],
  body: headingNote,
  connected: ["page_other"],
  attachments: [{ id: "att", kind: "pdf", r2_key: "notes/x.pdf", filename: "x.pdf", content_type: "application/pdf" }],
  source: "notion",
  source_notion_id: "long",
  source_notion_url: "https://notion.so/long",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

describe("splitMarkdown", () => {
  it("leaves a short note whole", () => {
    expect(splitMarkdown("Just a short note.", 8000)).toEqual(["Just a short note."]);
  });

  it("halves at a heading near the midpoint", () => {
    const parts = splitMarkdown(headingNote, Math.ceil(headingNote.length / 2) + 20);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toContain("# One");
    expect(parts.some(part => part.includes("# Four"))).toBe(true);
    expect(parts.every(part => part.length <= Math.ceil(headingNote.length / 2) + 20)).toBe(true);
  });

  it("quarters when the limit is about a quarter of the note", () => {
    const parts = splitMarkdown(headingNote, Math.ceil(headingNote.length / 4) + 30);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(parts.every(part => part.length <= Math.ceil(headingNote.length / 4) + 30)).toBe(true);
  });
});

describe("splitLeftoverPage", () => {
  it("keeps the original id and attachments on part 1, and creates hub siblings", () => {
    let n = 0;
    const result = splitLeftoverPage(page(), "2026-08-23T12:00:00.000Z", () => `page_hub_part${++n}`, 400);
    expect(result.created.length).toBeGreaterThanOrEqual(1);
    expect(result.kept.id).toBe("page_notion_long");
    expect(result.kept.title).toMatch(/\(1\//);
    expect(result.kept.attachments).toHaveLength(1);
    expect(result.kept.connected).toEqual(expect.arrayContaining(["page_other", "page_hub_part1"]));
    expect(result.created[0]?.source).toBe("hub");
    expect(result.created[0]?.attachments).toEqual([]);
    expect(result.created[0]?.origins).toEqual([{ kind: "unit", label: "EDST5321" }]);
    expect(result.created[0]?.connected).toContain("page_notion_long");
  });

  it("does not create siblings when the body already fits", () => {
    expect(splitLeftoverPage(page({ body: "Tiny." }), "2026-08-23T12:00:00.000Z").created).toEqual([]);
  });
});
