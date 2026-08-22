import { describe, expect, it } from "vitest";
import { originsFromNotesPlace } from "./notesPlace";

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

  it("ignores unknown or empty Notion ids", () => {
    expect(originsFromNotesPlace()).toEqual([]);
    expect(originsFromNotesPlace("not-an-id")).toEqual([]);
    expect(originsFromNotesPlace("ffffffffffffffffffffffffffffffff")).toEqual([]);
  });
});
