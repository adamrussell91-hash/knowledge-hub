import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_SCALE,
  UNIT_SCALE,
  cameraForLayer,
  catalogueSpan,
  layerForScale,
  packLanes,
  zoomCamera,
} from "./layout";
import type { DegreeRecord } from "./types";

const bachelor: DegreeRecord = {
  id: "ba",
  title: "Bachelor",
  institution: "UoN",
  status: "completed",
  start: "2009-02-01",
  end: "2013-12-01",
  description: null,
  units: [],
};

const later: DegreeRecord = {
  id: "gc",
  title: "Grad Cert",
  institution: "CSU",
  status: "completed",
  start: "2018-01-31",
  end: "2019-12-31",
  description: null,
  units: [],
};

describe("timeline layout", () => {
  it("reveals units then assessments as scale increases", () => {
    expect(layerForScale(1)).toBe("degrees");
    expect(layerForScale(UNIT_SCALE)).toBe("units");
    expect(layerForScale(ASSESSMENT_SCALE)).toBe("assessments");
  });

  it("gives each degree its own row in start order", () => {
    const packed = packLanes([later, bachelor]);
    expect(packed.laneCount).toBe(2);
    expect(packed.lanes).toEqual([
      { id: "ba", lane: 0 },
      { id: "gc", lane: 1 },
    ]);
  });

  it("tightens the camera until a requested layer is visible", () => {
    const bounds = catalogueSpan([bachelor, later]);
    const next = cameraForLayer(bounds, bounds, "units");
    expect(layerForScale((bounds.endMs - bounds.startMs) / (next.endMs - next.startMs))).toBe("units");
  });

  it("zooms around a focus date without leaving the catalogue span", () => {
    const bounds = catalogueSpan([bachelor, later]);
    const mid = Date.UTC(2011, 0, 1);
    const next = zoomCamera(bounds.startMs, bounds.endMs, mid, 2, bounds);
    expect(next.endMs - next.startMs).toBeLessThan(bounds.endMs - bounds.startMs);
    expect(next.startMs).toBeGreaterThanOrEqual(bounds.startMs);
    expect(next.endMs).toBeLessThanOrEqual(bounds.endMs);
  });
});
