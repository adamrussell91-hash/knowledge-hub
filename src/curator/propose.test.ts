import { describe, expect, it } from "vitest";
import { buildProposePrompt } from "./propose";
import type { Page } from "../domain/page";

const note: Page = {
  id: "a",
  title: "Duty",
  area: "notes",
  tags: [],
  body: "Inherited duty",
  connected: [],
  attachments: [],
  source_notion_id: "a",
  source_notion_url: "https://notion.so/a",
  created_at: "2026-08-15T00:00:00.000Z",
  updated_at: "2026-08-15T00:00:00.000Z",
  schema_version: 1,
};

describe("buildProposePrompt", () => {
  it("asks for the fixed relation set and JSON only", () => {
    const prompt = buildProposePrompt(note, [{ pageId: "b", title: "Heaney", excerpt: "the poem", score: 0.7 }]);
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("builds-on");
    expect(prompt).toContain("id:b");
  });
});
