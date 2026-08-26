import { describe, expect, it } from "vitest";
import { isVisualiserHash, pageIdFromHash, visualiserHashForIdea, visualiserIdeaFromHash } from "./pageHash";

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

describe("visualiser hash", () => {
  it("reads #visualiser and an optional idea", () => {
    expect(isVisualiserHash("#visualiser")).toBe(true);
    expect(isVisualiserHash("#visualiser/thread")).toBe(true);
    expect(isVisualiserHash("#page/x")).toBe(false);
    expect(visualiserIdeaFromHash("#visualiser")).toBeNull();
    expect(visualiserIdeaFromHash("#visualiser/together")).toBe("together");
    expect(visualiserHashForIdea("header")).toBe("#visualiser/header");
  });
});
