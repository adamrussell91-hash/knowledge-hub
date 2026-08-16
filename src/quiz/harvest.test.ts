import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { harvestPage, quizItemId } from "./harvest";

function page(body: string, overrides: Partial<Page> = {}): Page {
  return {
    id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    title: "Test",
    area: "notes",
    tags: ["memory"],
    body,
    attachments: [],
    source_notion_id: "page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_notion_url: "https://notion.so/page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-02T00:00:00.000Z",
    schema_version: 1,
    ...overrides,
  };
}

describe("harvestPage", () => {
  it("skips short bodies", () => {
    expect(harvestPage(page("Hi there"))).toEqual([]);
  });

  it("pulls Q/A and Question/Explain pairs without regenerating them", () => {
    const items = harvestPage(
      page(`Intro paragraph so the body is long enough to harvest.

Q: What is retrieval practice?
A: Recalling from memory rather than rereading.

Question: Why space reviews?
Explain: Forgetting then retrieving strengthens storage strength.
`),
    );
    expect(items.map(item => ({ kind: item.kind, cue: item.cue, answer: item.answer }))).toEqual([
      {
        kind: "qa",
        cue: "What is retrieval practice?",
        answer: "Recalling from memory rather than rereading.",
      },
      {
        kind: "qa",
        cue: "Why space reviews?",
        answer: "Forgetting then retrieving strengthens storage strength.",
      },
    ]);
  });

  it("pulls bold definitions", () => {
    const items = harvestPage(
      page(`A reasonably long note about memory research and classroom practice.

**Spacing effect**: distributed practice beats massed practice.

**Retrieval practice** is the act of recalling information from memory.
`),
    );
    expect(items.filter(item => item.kind === "definition")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cue: "Spacing effect",
          answer: "distributed practice beats massed practice.",
        }),
        expect.objectContaining({
          cue: "Retrieval practice",
          answer: "the act of recalling information from memory.",
        }),
      ]),
    );
  });

  it("turns headings plus the next paragraph into claims and skips References", () => {
    const items = harvestPage(
      page(`# Title is not harvested

## Testing effect

Attempting to recall strengthens memory more than rereading.

## References

Roediger 2006 is not a card.
`),
    );
    expect(items.filter(item => item.kind === "heading")).toEqual([
      expect.objectContaining({
        cue: "What does this note claim about: Testing effect?",
        answer: "Attempting to recall strengthens memory more than rereading.",
      }),
    ]);
  });

  it("turns blockquotes into cloze by blanking every other long word", () => {
    const items = harvestPage(
      page(`Padding paragraph so harvest is allowed on this reasonably long note.

> Retrieval practice strengthens memory more than rereading notes.
`),
    );
    expect(items.filter(item => item.kind === "cloze")).toEqual([
      expect.objectContaining({
        kind: "cloze",
        cue: "Retrieval _____ strengthens _____ more than rereading _____.",
        answer: "Retrieval practice strengthens memory more than rereading notes.",
      }),
    ]);
  });

  it("caps at 12 items and keeps ids stable", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Q: Question ${i}?\nA: Answer ${i}.`).join("\n\n");
    const items = harvestPage(page(`Padding so the body clears eighty characters.\n\n${lines}`));
    expect(items).toHaveLength(12);
    const again = harvestPage(page(`Padding so the body clears eighty characters.\n\n${lines}`));
    expect(again.map(item => item.id)).toEqual(items.map(item => item.id));
    expect(items[0].id).toBe(
      quizItemId(items[0].page_id, items[0].kind, items[0].cue),
    );
  });
});
