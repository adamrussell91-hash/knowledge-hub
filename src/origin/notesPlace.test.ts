import { describe, expect, it } from "vitest";
import { extractNotionHex, originsFromNotesPlace, resolvedOrigins } from "./notesPlace";

describe("origins from the recovered Notion place snapshot", () => {
  it("returns notebook, book, and PD pills for known notes", () => {
    expect(originsFromNotesPlace("00c518fb7b884781a60f702ec3185eb3")).toEqual([
      { kind: "notebook", label: "Boy's Education" },
    ]);
    expect(originsFromNotesPlace("163f794f-8476-8001-aebf-fe92627dc423")).toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
    expect(originsFromNotesPlace("2b1f794f84768055a63de8af7786916e")).toEqual([
      { kind: "notebook", label: "Literacy" },
      { kind: "pd", label: "ETA Conference 2025" },
    ]);
  });

  it("extracts a Notion hex from page ids and URLs", () => {
    expect(extractNotionHex("page_notion_00c518fb7b884781a60f702ec3185eb3")).toBe(
      "00c518fb7b884781a60f702ec3185eb3",
    );
    expect(extractNotionHex("https://www.notion.so/Habits-163f794f84768001aebffe92627dc423")).toBe(
      "163f794f84768001aebffe92627dc423",
    );
    expect(extractNotionHex("00c518fb-7b88-4781-a60f-702ec3185eb3")).toBe("00c518fb7b884781a60f702ec3185eb3");
  });

  it("fills recovered pills from a page_notion id when the row has none stored", () => {
    expect(resolvedOrigins({ id: "page_notion_00c518fb7b884781a60f702ec3185eb3" })).toEqual([
      { kind: "notebook", label: "Boy's Education" },
    ]);
    expect(
      originsFromNotesPlace("page_notion_163f794f84768001aebffe92627dc423"),
    ).toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
  });

  it("ignores unknown or empty Notion ids", () => {
    expect(originsFromNotesPlace()).toEqual([]);
    expect(originsFromNotesPlace("not-an-id")).toEqual([]);
    expect(originsFromNotesPlace("ffffffffffffffffffffffffffffffff")).toEqual([]);
  });
});
