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
  { title: "Stick", origins: [{ kind: "book" as const, label: "Make It Stick" }] },
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

  it("recovers notebook and book pills from a page_notion id when the manifest stored none", () => {
    const recovered = [{ id: "page_notion_00c518fb7b884781a60f702ec3185eb3", title: "Boys" }];
    expect(pageMatchesOriginFilter(recovered[0]!, { kind: "notebook", label: "" })).toBe(true);
    expect(originLabelsForKind(recovered, "notebook")).toEqual([{ label: "Boy's Education", count: 1 }]);
    expect(originLabelsForKind(recovered, "book")).toEqual([]);
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

  it("renders kind chips and the chosen label without dumping the catalog", () => {
    const html = originFilterHtml(pages, { kind: "book", label: "Atomic Habits" });
    expect(html).toContain('class="tag-pill is-selected"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-origin-kind="notebook"');
    expect(html).toContain('data-origin-kind="book"');
    expect(html).toContain('data-origin-kind="pd"');
    expect(html).toContain('data-origin-label="Atomic Habits"');
    expect(html).toContain("Change");
    expect(html).toContain("Clear Atomic Habits");
    expect(html).not.toContain("origin-label-search");
    expect(html).not.toContain("filter-chip");
    expect(originFilterTitle({ kind: "book", label: "Atomic Habits" })).toBe("Atomic Habits");
  });

  it("opens a searchable list instead of a pill dump when a kind is chosen", () => {
    const html = originFilterHtml(pages, { kind: "notebook", label: "" });
    expect(html).toContain("Find a notebook");
    expect(html).toContain("2 notebooks");
    expect(html).toContain("origin-label-search");
    expect(html).toContain('data-origin-option="Cognitive Psychology"');
    expect(html).toContain('data-origin-option="Pedagogy and Planning"');
    expect(html).not.toMatch(/tag-pill[^>]+data-origin-label="Cognitive Psychology"/);
  });
});
