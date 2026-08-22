import { describe, expect, it } from "vitest";
import {
  inferOriginFromLabel,
  notionIdFromSource,
  notionPropertyLabels,
  notionRelationIds,
  originsFromBody,
  originsFromNotionProperties,
  originsFromUnitTags,
  stampPageOrigins,
  unitCodeFromLabel,
} from "./fromPlace";
import { applyUnitDegreeMap } from "./unitDegrees";

describe("origins from existing place data", () => {
  it("lifts unit codes already sitting in tags", () => {
    expect(originsFromUnitTags(["Note", "EDST5805", "Philosophy Knowledge and Society"])).toEqual([
      { kind: "unit", label: "EDST5805" },
    ]);
  });

  it("reads Notion-style property lines from the body", () => {
    expect(
      originsFromBody(`# Lecture

Degree: MEd
Unit: EDST5805, EDGL909
Notebook: Brown 2022
Book: Make It Stick
PD: HALT workshop 2024

The lecture itself.`),
    ).toEqual([
      { kind: "book", label: "Make It Stick" },
      { kind: "degree", label: "MEd" },
      { kind: "notebook", label: "Brown 2022" },
      { kind: "pd", label: "HALT workshop 2024" },
      { kind: "unit", label: "EDGL909" },
      { kind: "unit", label: "EDST5805" },
    ]);
  });

  it("maps the live Notes and University property names", () => {
    expect(
      originsFromNotionProperties({
        Notebooks: { type: "select", select: { name: "Cognitive Psychology" } },
        "Unit Number": { type: "select", select: { name: "EDST5805: Curriculum Differentiation and Assessment in Gifted Education" } },
        "Book/Journal": { type: "relation", relation: [{ id: "15df794f-8476-80f7-ae79-f77b0001c400" }] },
        Tags: { type: "multi_select", multi_select: [{ name: "Note" }] },
      }),
    ).toEqual([
      { kind: "notebook", label: "Cognitive Psychology" },
      { kind: "unit", label: "EDST5805" },
    ]);
  });

  it("maps Notion property objects and infers Type values", () => {
    expect(
      originsFromNotionProperties({
        Degree: { type: "select", select: { name: "MEd" } },
        Unit: { type: "multi_select", multi_select: [{ name: "EDST5805" }] },
        Type: { type: "select", select: { name: "Notebook — Blue 2019" } },
        Tags: { type: "multi_select", multi_select: [{ name: "Note" }] },
      }),
    ).toEqual([
      { kind: "degree", label: "MEd" },
      { kind: "notebook", label: "Notebook — Blue 2019" },
      { kind: "unit", label: "EDST5805" },
    ]);
  });

  it("reads Notion rich-text and select names", () => {
    expect(notionPropertyLabels({ type: "rich_text", rich_text: [{ plain_text: "Make It Stick" }] })).toEqual([
      "Make It Stick",
    ]);
    expect(inferOriginFromLabel("PhD")).toEqual({ kind: "degree", label: "PhD" });
  });

  it("dashes a stored Notion id for the API", () => {
    expect(notionIdFromSource("13ef794f84768078bbe7d30d66a8709c")).toBe("13ef794f-8476-8078-bbe7-d30d66a8709c");
    expect(notionIdFromSource("page_notion_13ef794f84768078bbe7d30d66a8709c")).toBe(
      "13ef794f-8476-8078-bbe7-d30d66a8709c",
    );
    expect(notionIdFromSource("not-an-id")).toBeNull();
  });

  it("keeps the unit code from a Unit Number select", () => {
    expect(unitCodeFromLabel("EDST5805: Curriculum Differentiation and Assessment in Gifted Education")).toBe("EDST5805");
    expect(notionRelationIds({ type: "relation", relation: [{ id: "15df794f-8476-80f7-ae79-f77b0001c400" }] })).toEqual([
      "15df794f-8476-80f7-ae79-f77b0001c400",
    ]);
  });

  it("fills notebook, book, and PD from the recovered Notion snapshot", () => {
    expect(
      stampPageOrigins({
        tags: ["Note"],
        body: "Lecture notes.",
        source_notion_id: "163f794f84768001aebffe92627dc423",
      }),
    ).toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
    expect(
      stampPageOrigins({
        id: "page_notion_163f794f84768001aebffe92627dc423",
        tags: ["Note"],
        body: "Lecture notes.",
      }),
    ).toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
    ]);
  });

  it("keeps pills already on the page and adds recovered ones", () => {
    expect(
      stampPageOrigins({
        tags: ["Note", "HIST2001"],
        body: "Degree: MEd\n\nBody.",
        origins: [{ kind: "book", label: "Make It Stick" }],
      }),
    ).toEqual([
      { kind: "book", label: "Make It Stick" },
      { kind: "degree", label: "MEd" },
      { kind: "unit", label: "HIST2001" },
    ]);
  });

  it("fills the degree from the unit’s Notion parent", () => {
    expect(stampPageOrigins({ tags: ["EDST5805"], body: "Lecture notes." })).toEqual([
      { kind: "degree", label: "Master of Education (Gifted Education)" },
      { kind: "unit", label: "EDST5805" },
    ]);
    expect(
      applyUnitDegreeMap(
        [
          { kind: "unit", label: "HNO6014" },
          { kind: "notebook", label: "Wellbeing" },
        ],
      ),
    ).toEqual([
      { kind: "degree", label: "Graduate Certificate in Child and Adolescent Mental Health" },
      { kind: "notebook", label: "Wellbeing" },
      { kind: "unit", label: "HNO6014" },
    ]);
    expect(applyUnitDegreeMap([{ kind: "unit", label: "EDUC6119" }])).toEqual([
      { kind: "unit", label: "EDUC6119" },
    ]);
  });
});
