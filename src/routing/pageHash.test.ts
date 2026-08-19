import { describe, expect, it } from "vitest";
import { pageIdFromHash } from "./pageHash";

describe("pageIdFromHash", () => {
  it("reads a page id from #page/<id>", () => {
    expect(pageIdFromHash("#page/note_1")).toBe("note_1");
  });

  it("decodes the id", () => {
    expect(pageIdFromHash("#page/note%2Fnested")).toBe("note/nested");
  });

  it("rejects empty, other rails, and extra path", () => {
    expect(pageIdFromHash("#page/")).toBeNull();
    expect(pageIdFromHash("#alchemist")).toBeNull();
    expect(pageIdFromHash("#/page/x")).toBeNull();
    expect(pageIdFromHash("#page/a/b")).toBeNull();
    expect(pageIdFromHash("")).toBeNull();
  });
});
