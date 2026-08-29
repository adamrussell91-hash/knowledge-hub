/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { catalogueSpan, zoomCamera } from "./layout";
import type { DegreeRecord } from "./types";
import data from "./data.json";
import { gpaChipHtml, layerFromCamera, selectionCardHtml, timelineChartHtml } from "./view";

const degrees: DegreeRecord[] = [
  {
    id: "ba",
    title: "Bachelor of Teaching and Arts Degree",
    institution: "University of Newcastle",
    status: "completed",
    start: "2009-02-01",
    end: "2013-12-01",
    description: null,
    units: [
      {
        id: "ahis",
        title: "AHIS1040 - War in the Ancient World",
        code: "AHIS1040",
        status: "completed",
        start: "2009-02-01",
        end: "2009-07-01",
        gpaPoints: 4,
        grade: "Pass",
        description: null,
        assessments: [],
      },
    ],
  },
  {
    id: "med",
    title: "Master of Education (Gifted Education)",
    institution: "University of New South Wales",
    status: "completed",
    start: "2025-02-10",
    end: "2026-04-24",
    description: null,
    units: [
      {
        id: "edst",
        title: "EDST5448 - Educational Research",
        code: "EDST5448",
        status: "completed",
        start: "2025-02-10",
        end: "2025-11-27",
        gpaPoints: 7,
        grade: "High Distinction",
        description: null,
        assessments: [
          {
            id: "quiz",
            title: "Assessment 1: Online quiz",
            kind: "test",
            status: "completed",
            start: "2025-10-17",
            end: null,
            gpaPoints: 7,
            grade: "High Distinction",
            description: "High Distinction Achieved in Educational Research Online Assessment",
            unitNumber: "EDST5448",
          },
        ],
      },
    ],
  },
];

describe("university timeline view", () => {
  it("shows degrees when zoomed out and units after zooming into a degree", () => {
    const bounds = catalogueSpan(degrees);
    const wide = timelineChartHtml(degrees, bounds, 900, null);
    expect(wide).toContain("Bachelor of Teaching and Arts Degree");
    expect(wide).not.toContain("uni-tl__labels");
    expect(wide).not.toContain("uni-tl__label");
    expect(wide).not.toContain("data-tl-unit");
    expect(layerFromCamera(degrees, bounds)).toBe("degrees");

    const unitView = zoomCamera(bounds.startMs, bounds.endMs, Date.UTC(2009, 5, 1), 3, bounds);
    const units = timelineChartHtml(degrees, unitView, 900, null);
    expect(layerFromCamera(degrees, unitView)).not.toBe("degrees");
    expect(units).toContain("AHIS1040");
  });

  it("shows the assessment grade on the open card", () => {
    const html = selectionCardHtml(degrees, {
      kind: "assessment",
      degreeId: "med",
      unitId: "edst",
      assessmentId: "quiz",
    });
    expect(html).toContain("Assessment 1: Online quiz");
    expect(html).toContain("High Distinction");
    expect(html).toContain("7 / 7");
    expect(html).toContain("Assessment grade");
  });

  it("keeps official university names and shows when an in-progress degree finishes", () => {
    const catalogue = data.degrees as DegreeRecord[];
    const html = timelineChartHtml(catalogue, catalogueSpan(catalogue), 1400, null);
    const byTitle = Object.fromEntries(catalogue.map(degree => [degree.title, degree]));
    expect(byTitle["Bachelor of Teaching and Arts Degree"]?.institution).toBe("University of Newcastle");
    expect(byTitle["Graduate Certificate in Transformational Leadership"]?.institution).toBe(
      "University of Newcastle",
    );
    expect(byTitle["Master of Cognitive Psychology"]?.institution).toBe("Flinders University");
    expect(byTitle["Master of Education (Educational Leadership)"]).toMatchObject({
      institution: "University of Wollongong",
      status: "in-progress",
      end: "2027-06-25",
    });
    expect(html).toContain("University of Newcastle");
    expect(html).toContain("Flinders University");
    expect(html).toContain("until 25/06/27");
  });

  it("renders a hovering GPA calculator chip", () => {
    const html = gpaChipHtml(degrees, false, false);
    expect(html).toContain("data-gpa-toggle");
    expect(html).toContain("GPA");
    expect(html).toContain("/ 7");
    expect(html).toContain("Include ungraded passes");
  });
});
