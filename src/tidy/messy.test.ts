import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { canStampWithoutModel, isMessy, shouldSkipTidy } from "./messy";

const page = (overrides: Partial<Page> = {}): Page => ({
  id: "page_hub_caesar",
  title: "Caesar and the Roman Republic",
  area: "university",
  tags: ["Note", "HIST2001", "Philosophy Knowledge and Society"],
  body: "A short, clean note.",
  connected: [],
  attachments: [],
  source: "hub",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",
  schema_version: 1,
  ...overrides,
});

describe("messy note signals", () => {
  it("spots triple blank lines and a duplicate leading H1", () => {
    expect(isMessy(page({ body: "# Caesar and the Roman Republic\n\n\n\nText" }))).toBe(true);
    expect(isMessy(page({ body: "# Caesar and the Roman Republic\n\nText" }))).toBe(true);
    expect(isMessy(page({ body: "Text\r\n\r\n\r\nMore" }))).toBe(true);
  });

  it("does not mark a clean short note as messy", () => {
    expect(isMessy(page())).toBe(false);
  });

  it("spots too many topic tags", () => {
    expect(isMessy(page({ tags: ["Note", "Learning Science and Cognition", "Motivation and Self Regulation", "Pedagogy and Instructional Design", "Philosophy Knowledge and Society"] }))).toBe(true);
  });

  it("spots old labels that are not on the closed list", () => {
    expect(isMessy(page({ tags: ["Note", "Educational Psychology"] }))).toBe(true);
  });

  it("spots old labels that are not on the closed list", () => {
    expect(isMessy(page({ tags: ["Note", "Educational Psychology"] }))).toBe(true);
  });

  it("spots a run of one-sentence prose paragraphs", () => {
    expect(isMessy(page({ body: "One sentence.\n\nTwo sentence.\n\nThree sentence.\n\nFour sentence." }))).toBe(true);
  });

  it("skips only clean notes tidied after their latest edit", () => {
    expect(shouldSkipTidy(page(), "2026-08-11T00:00:00.000Z")).toBe(true);
    expect(shouldSkipTidy(page(), "2026-08-09T00:00:00.000Z")).toBe(false);
    expect(shouldSkipTidy(page({ body: "Text\n\n\n\nMore" }), "2026-08-11T00:00:00.000Z")).toBe(false);
  });

  it("stamps only clean notes that already have 1–3 closed-list topic tags", () => {
    expect(canStampWithoutModel(page())).toBe(true);
    expect(canStampWithoutModel(page({ tags: ["Note", "EDST5805", "Philosophy Knowledge and Society", "Learning Science and Cognition"] }))).toBe(true);
    expect(canStampWithoutModel(page({ tags: ["Note", "EDST5805"] }))).toBe(false);
    expect(canStampWithoutModel(page({ tags: ["Educational Psychology"] }))).toBe(false);
    expect(canStampWithoutModel(page({ body: "Text\n\n\n\nMore" }))).toBe(false);
  });
});
