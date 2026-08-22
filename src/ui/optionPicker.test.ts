import { describe, expect, it } from "vitest";
import { filterPickerOptions, optionPickerHtml, optionPickerListHtml } from "./optionPicker";

describe("option picker", () => {
  it("filters labels without dumping the unmatched ones", () => {
    expect(filterPickerOptions(["Atomic Habits", "Make It Stick", "Cognitive Psychology"], "habit")).toEqual([
      { label: "Atomic Habits" },
    ]);
    expect(filterPickerOptions(["Atomic Habits"], "   ")).toEqual([{ label: "Atomic Habits" }]);
  });

  it("keeps the catalog closed until the picker is opened", () => {
    const html = optionPickerHtml({
      selected: ["Learning Science and Cognition"],
      options: ["Learning Science and Cognition", "Pedagogy and Instructional Design"],
      query: "",
      open: false,
      searchId: "compose-tag-search",
      searchLabel: "Find a tag",
      searchPlaceholder: "Start typing…",
      emptyLabel: "No matching tags.",
      addLabel: "Add a tag",
      selectedAttr: "data-tag-pill",
      optionAttr: "data-tag-option",
    });
    expect(html).toContain("Learning Science and Cognition");
    expect(html).toContain("Add a tag");
    expect(html).not.toContain("data-tag-option");
    expect(html).not.toContain("Pedagogy and Instructional Design");
  });

  it("offers Change instead of Add when a single-select value is set", () => {
    const html = optionPickerHtml({
      selected: ["Atomic Habits"],
      options: ["Atomic Habits", "Make It Stick"],
      query: "",
      open: false,
      searchId: "origin-label-search",
      searchLabel: "Find a book",
      searchPlaceholder: "Start typing…",
      emptyLabel: "Nothing matches that.",
      addLabel: "Choose a book",
      changeLabel: "Change",
      selectedAttr: "data-origin-label",
      optionAttr: "data-origin-option",
    });
    expect(html).toContain("Change");
    expect(html).not.toContain("Choose a book");
    expect(html).not.toContain("origin-label-search");
  });

  it("lists remaining options in a searchable panel when open", () => {
    const html = optionPickerHtml({
      selected: ["Learning Science and Cognition"],
      options: ["Learning Science and Cognition", "Pedagogy and Instructional Design"],
      query: "pedag",
      open: true,
      searchId: "compose-tag-search",
      searchLabel: "Find a tag",
      searchPlaceholder: "Start typing…",
      emptyLabel: "No matching tags.",
      addLabel: "Add a tag",
      countLabel: "1 of 3",
      selectedAttr: "data-tag-pill",
      optionAttr: "data-tag-option",
    });
    expect(html).toContain('id="compose-tag-search"');
    expect(html).toContain("Pedagogy and Instructional Design");
    expect(html).toContain("1 of 3");
    expect(html).toContain("data-picker-close");
    expect(html.match(/data-tag-option/g)).toHaveLength(1);
  });

  it("keeps note counts on origin options", () => {
    expect(
      optionPickerListHtml({
        options: [{ label: "EDST5805", detail: "12" }],
        optionAttr: "data-origin-option",
        emptyLabel: "Nothing here.",
      }),
    ).toContain("12");
  });

  it("hides the catalog at cap", () => {
    const html = optionPickerHtml({
      selected: ["A", "B", "C"],
      options: ["A", "B", "C", "D"],
      query: "",
      open: true,
      searchId: "compose-tag-search",
      searchLabel: "Find a tag",
      searchPlaceholder: "Start typing…",
      emptyLabel: "No matching tags.",
      addLabel: "Add a tag",
      capHint: "3 of 3 — remove one to change.",
      atCap: true,
      selectedAttr: "data-tag-pill",
      optionAttr: "data-tag-option",
    });
    expect(html).toContain("3 of 3 — remove one to change.");
    expect(html).not.toContain("data-tag-option");
    expect(html).not.toContain("compose-tag-search");
  });

  it("renders an empty search state", () => {
    expect(optionPickerListHtml({ options: [], optionAttr: "data-x", emptyLabel: "Nothing here." })).toContain(
      "Nothing here.",
    );
  });
});
