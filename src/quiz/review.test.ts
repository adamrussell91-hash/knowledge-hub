import { describe, expect, it } from "vitest";
import { harvestPage } from "./harvest";
import type { Page } from "../domain/page";
import { applyRating } from "./review";

const page: Page = {
  id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  title: "Test",
  area: "notes",
  tags: ["memory"],
  body: `Padding so the body is long enough to harvest testable units here.

Q: What is retrieval practice?
A: Recalling from memory rather than rereading.
`,
  attachments: [],
  source_notion_id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  source_notion_url: "https://notion.so/page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
  schema_version: 1,
};

describe("applyRating", () => {
  it("Again on a new card marks failed", () => {
    const [item] = harvestPage(page);
    const next = applyRating(item, 1, new Date("2024-02-01T00:00:00.000Z"));
    expect(next.fsrs.reps).toBeGreaterThanOrEqual(1);
    expect(next.last_rating).toBe(1);
    expect(next.status).toBe("failed");
  });

  it("Easy on a new card schedules a later due date", () => {
    const [item] = harvestPage(page);
    const now = new Date("2024-02-01T00:00:00.000Z");
    const next = applyRating(item, 4, now);
    expect(Date.parse(next.fsrs.due)).toBeGreaterThan(now.getTime());
    expect(next.last_rating).toBe(4);
    expect(next.fsrs.reps).toBeGreaterThanOrEqual(1);
  });
});
