import { describe, expect, it } from "vitest";
import {
  inferOriginFromLabel,
  notionIdFromSource,
  notionPropertyLabels,
  originsFromBody,
  originsFromNotionProperties,
  originsFromUnitTags,
  stampPageOrigins,
} from "./fromPlace";

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
    expect(notionIdFromSource("not-an-id")).toBeNull();
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
});
