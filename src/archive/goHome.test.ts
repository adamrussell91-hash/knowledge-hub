import { describe, expect, it } from "vitest";
import { goHome } from "./goHome";

describe("goHome", () => {
  it("returns to the unfiltered archive list from an open page", () => {
    expect(
      goHome({
        view: "page",
        query: "caesar",
        keywordFilter: "Philosophy Knowledge and Society",
        originFilter: { kind: "notebook", label: "Cognitive Psychology" },
        activePage: { id: "page_notion_abc" },
        compose: { id: "page_notion_abc" },
      }),
    ).toEqual({
      view: "list",
      query: "",
      keywordFilter: "",
      originFilter: { kind: "", label: "" },
      activePage: null,
      compose: null,
    });
  });

  it("returns to the unfiltered archive list from the university timeline", () => {
    expect(
      goHome({
        view: "timeline",
        query: "",
        keywordFilter: "",
        originFilter: { kind: "", label: "" },
        activePage: null,
        compose: null,
      }),
    ).toMatchObject({ view: "list", activePage: null, compose: null });
  });

  it("returns to the unfiltered archive list from quiz", () => {
    expect(
      goHome({
        view: "quiz",
        query: "",
        keywordFilter: "Pedagogy and Instructional Design",
        originFilter: { kind: "book", label: "Atomic Habits" },
        activePage: null,
        compose: null,
      }),
    ).toMatchObject({ view: "list", keywordFilter: "", activePage: null, compose: null });
  });
});
