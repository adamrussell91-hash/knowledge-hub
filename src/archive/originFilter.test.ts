import { describe, expect, it } from "vitest";
import {
  emptyOriginFilter,
  originFilterHtml,
  originFilterTitle,
  originLabelsForKind,
  pageMatchesOriginFilter,
  toggleOriginKind,
  toggleOriginLabel,
} from "./originFilter";

const pages = [
  {
    title: "Habits",
    origins: [
      { kind: "notebook" as const, label: "Cognitive Psychology" },
      { kind: "book" as const, label: "Atomic Habits" },
    ],
  },
  {
    title: "HALT",
    origins: [
      { kind: "notebook" as const, label: "Pedagogy and Planning" },
      { kind: "pd" as const, label: "2026 NSW HALT Conference" },
    ],
  },
  { title: "Unit only", origins: [{ kind: "unit" as const, label: "EDST5805" }] },
];

describe("archive origin filters", () => {
  it("matches a kind, then a specific label", () => {
    expect(pageMatchesOriginFilter(pages[0]!, emptyOriginFilter())).toBe(true);
    expect(pageMatchesOriginFilter(pages[0]!, { kind: "notebook", label: "" })).toBe(true);
    expect(pageMatchesOriginFilter(pages[2]!, { kind: "notebook", label: "" })).toBe(false);
    expect(pageMatchesOriginFilter(pages[0]!, { kind: "book", label: "Atomic Habits" })).toBe(true);
    expect(pageMatchesOriginFilter(pages[1]!, { kind: "book", label: "Atomic Habits" })).toBe(false);
  });

  it("lists labels that already sit on notes", () => {
    expect(originLabelsForKind(pages, "notebook")).toEqual([
      { label: "Cognitive Psychology", count: 1 },
      { label: "Pedagogy and Planning", count: 1 },
    ]);
    expect(originLabelsForKind(pages, "degree")).toEqual([]);
  });

  it("toggles kind and label chips", () => {
    const notebook = toggleOriginKind(emptyOriginFilter(), "notebook");
    expect(notebook).toEqual({ kind: "notebook", label: "" });
    expect(toggleOriginKind(notebook, "notebook")).toEqual(emptyOriginFilter());
    expect(toggleOriginLabel(notebook, "Cognitive Psychology")).toEqual({
      kind: "notebook",
      label: "Cognitive Psychology",
    });
    expect(toggleOriginLabel({ kind: "notebook", label: "Cognitive Psychology" }, "Cognitive Psychology")).toEqual({
      kind: "notebook",
      label: "",
    });
  });

  it("renders kind chips and the active label row", () => {
    const html = originFilterHtml(pages, { kind: "book", label: "Atomic Habits" });
    expect(html).toContain('data-origin-kind="notebook"');
    expect(html).toContain('data-origin-kind="book"');
    expect(html).toContain('data-origin-kind="pd"');
    expect(html).toContain('data-origin-label="Atomic Habits"');
    expect(html).toContain("Clear Atomic Habits");
    expect(originFilterTitle({ kind: "book", label: "Atomic Habits" })).toBe("Atomic Habits");
  });
});
