import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { applyRetagToPage, parseNoteEdit, retagDelta } from "./noteEdit";

const page: Page = {
  id: "page_hub_1",
  title: "Retrieval practice and spacing",
  area: "university",
  tags: ["Classroom Culture and Engagement", "Motivation and Self Regulation", "Note"],
  body: "Body",
  connected: [],
  attachments: [],
  source: "hub",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  schema_version: 1,
};

describe("parseNoteEdit", () => {
  it("strips a closed-list retag fence and keeps the prose", () => {
    const parsed = parseNoteEdit(
      `That swap is on the closed list.\n\n\`\`\`note-edit\n{"action":"retag","pageId":"page_hub_1","title":"Retrieval practice and spacing","tags":["Learning Science and Cognition","Motivation and Self Regulation"]}\n\`\`\``,
    );
    expect(parsed.prose).toBe("That swap is on the closed list.");
    expect(parsed.edit).toEqual({
      action: "retag",
      pageId: "page_hub_1",
      title: "Retrieval practice and spacing",
      tags: ["Learning Science and Cognition", "Motivation and Self Regulation"],
    });
  });

  it("drops unknown tags and garbage fences", () => {
    expect(parseNoteEdit("```note-edit\nnot json\n```").edit).toBeUndefined();
    expect(
      parseNoteEdit(
        '```note-edit\n{"action":"retag","pageId":"p","title":"T","tags":["not a real tag"]}\n```',
      ).edit,
    ).toBeUndefined();
  });
});

describe("applyRetagToPage", () => {
  it("replaces topic tags and keeps structural ones", () => {
    const next = applyRetagToPage(page, ["Learning Science and Cognition"]);
    expect(next.tags).toEqual(["Note", "Learning Science and Cognition"]);
    expect(next.id).toBe(page.id);
  });
});

describe("retagDelta", () => {
  it("names what comes off and what goes on", () => {
    expect(
      retagDelta(
        ["Classroom Culture and Engagement", "Motivation and Self Regulation"],
        ["Learning Science and Cognition", "Motivation and Self Regulation"],
      ),
    ).toEqual({
      removed: ["Classroom Culture and Engagement"],
      added: ["Learning Science and Cognition"],
      kept: ["Motivation and Self Regulation"],
    });
  });
});
