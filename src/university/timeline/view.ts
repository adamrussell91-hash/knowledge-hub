import { formatDisplayDate, formatDisplayDateRange } from "../../../design-kit/js/format-display-date.js";
import { escapeHtml } from "../../lib/dom";
import { formatGpa, statusLabel, summariseGpa } from "./gpa";
import { resolveAssessmentGrade } from "./grade";
import {
  assessmentMarks,
  catalogueSpan,
  layerForScale,
  packLanes,
  scaleLabel,
  spanOf,
  unitSpanFor,
  visibleOverlap,
  xAt,
  yearTicks,
} from "./layout";
import type { AssessmentRecord, DegreeRecord, TimelineCamera, UnitRecord, ZoomLayer } from "./types";

const SWATCHES = ["blue", "sage", "peach", "gold", "lilac"] as const;

export type TimelineSelection =
  | { kind: "degree"; degreeId: string }
  | { kind: "unit"; degreeId: string; unitId: string }
  | { kind: "assessment"; degreeId: string; unitId: string; assessmentId: string };

export type TimelineViewState = {
  camera: TimelineCamera;
  includeUngraded: boolean;
  gpaOpen: boolean;
  selection: TimelineSelection | null;
};

export function swatchFor(index: number) {
  return SWATCHES[index % SWATCHES.length]!;
}

export function layerFromCamera(degrees: DegreeRecord[], camera: TimelineCamera): ZoomLayer {
  const bounds = catalogueSpan(degrees);
  const scale = (bounds.endMs - bounds.startMs) / Math.max(1, camera.endMs - camera.startMs);
  return layerForScale(scale);
}

function dateLabel(start: string | null, end: string | null) {
  return formatDisplayDateRange(start, end) || "Dates not recorded";
}

function gradeText(grade: string | null, points: number | null) {
  if (grade && points != null) return `${grade} · ${formatGpa(points)} / 7`;
  if (grade) return grade;
  if (points != null) return `${formatGpa(points)} / 7`;
  return "Grade not recorded";
}

function findDegree(degrees: DegreeRecord[], id: string) {
  return degrees.find(degree => degree.id === id) ?? null;
}

function findUnit(degree: DegreeRecord, id: string) {
  return degree.units.find(unit => unit.id === id) ?? null;
}

export function timelineToolbarHtml(layer: ZoomLayer) {
  return `<div class="uni-tl__toolbar glass-panel">
    <div class="graph-modes" role="group" aria-label="Timeline zoom">
      <button type="button" class="btn btn--ghost" data-tl-zoom="-1" aria-label="Zoom out">−</button>
      <button type="button" class="btn btn--ghost" data-tl-zoom="1" aria-label="Zoom in">+</button>
      <button type="button" class="btn btn--ghost" data-tl-fit>Fit</button>
    </div>
    <p class="uni-tl__layer" data-tl-layer>Showing ${escapeHtml(scaleLabel(layer).toLowerCase())}</p>
  </div>`;
}

export function gpaChipHtml(degrees: DegreeRecord[], includeUngraded: boolean, open: boolean) {
  const summary = summariseGpa(degrees, includeUngraded);
  const rows = summary.degrees
    .filter(degree => degree.gradedCount || degree.ungradedCount || degree.withdrawnCount)
    .map(
      degree => `<li>
        <span>${escapeHtml(degree.title)}</span>
        <strong>${escapeHtml(formatGpa(degree.gpa))}</strong>
      </li>`,
    )
    .join("");
  return `<aside class="gpa-chip ${open ? "is-open" : ""}" data-gpa>
    <button type="button" class="gpa-chip__hit" data-gpa-toggle aria-expanded="${open}">
      <span class="gpa-chip__eyebrow">GPA</span>
      <span class="gpa-chip__value">${escapeHtml(formatGpa(summary.overall))}</span>
      <span class="gpa-chip__scale">/ ${summary.scale}</span>
    </button>
    <div class="gpa-chip__panel glass-panel">
      <p class="gpa-chip__lead">Unweighted mean of completed unit points on the Australian 7-point scale. Withdrawn units stay out.</p>
      <label class="gpa-chip__toggle">
        <input type="checkbox" data-gpa-ungraded ${includeUngraded ? "checked" : ""} />
        Include ungraded passes
      </label>
      <p class="gpa-chip__meta">${summary.gradedCount} counted · ${summary.ungradedCount} ungraded · ${summary.withdrawnCount} withdrawn</p>
      <ul class="gpa-chip__degrees">${rows}</ul>
    </div>
  </aside>`;
}

function degreeMeta(degree: DegreeRecord) {
  const parts = [degree.institution];
  if (degree.status === "in-progress" && degree.end) {
    parts.push(`until ${formatDisplayDate(degree.end)}`);
  } else {
    parts.push(statusLabel(degree.status));
  }
  return parts.filter(Boolean).join(" · ");
}

function degreeBarHtml(
  degree: DegreeRecord,
  index: number,
  camera: TimelineCamera,
  width: number,
  selected: boolean,
) {
  const span = spanOf(degree);
  if (!span || !visibleOverlap(span.startMs, span.endMs, camera.startMs, camera.endMs)) return "";
  const left = xAt(span.startMs, camera.startMs, camera.endMs, width);
  const right = xAt(span.endMs, camera.startMs, camera.endMs, width);
  const meta = degreeMeta(degree);
  const hint = [degree.title, meta, dateLabel(degree.start, degree.end)].filter(Boolean).join(" · ");
  return `<button type="button" class="uni-tl__degree is-${swatchFor(index)} ${selected ? "is-selected" : ""}" data-tl-degree="${escapeHtml(degree.id)}" title="${escapeHtml(hint)}" style="left:${left}px;width:${Math.max(28, right - left)}px">
    <span class="uni-tl__degree-title">${escapeHtml(degree.title)}</span>
    <span class="uni-tl__degree-meta">${escapeHtml(meta)}</span>
  </button>`;
}

function unitBarHtml(
  unit: UnitRecord,
  degree: DegreeRecord,
  camera: TimelineCamera,
  width: number,
  selected: boolean,
) {
  const span = unitSpanFor(unit, degree);
  if (!span || !visibleOverlap(span.startMs, span.endMs, camera.startMs, camera.endMs)) return "";
  const left = xAt(span.startMs, camera.startMs, camera.endMs, width);
  const right = xAt(span.endMs, camera.startMs, camera.endMs, width);
  const label = unit.code ?? unit.title;
  return `<button type="button" class="uni-tl__unit is-${unit.status} ${selected ? "is-selected" : ""}" data-tl-unit="${escapeHtml(unit.id)}" data-tl-degree="${escapeHtml(degree.id)}" style="left:${left}px;width:${Math.max(18, right - left)}px" title="${escapeHtml(unit.title)}">
    <span>${escapeHtml(label)}</span>
  </button>`;
}

function assessmentCardHtml(
  assessment: AssessmentRecord & { startMs: number; endMs: number },
  unit: UnitRecord,
  degree: DegreeRecord,
  camera: TimelineCamera,
  width: number,
  selected: boolean,
) {
  if (!visibleOverlap(assessment.startMs, assessment.endMs, camera.startMs, camera.endMs)) return "";
  const left = xAt(assessment.startMs, camera.startMs, camera.endMs, width);
  const resolved = resolveAssessmentGrade(assessment, unit);
  return `<button type="button" class="uni-tl__assessment ${selected ? "is-selected" : ""}" data-tl-assessment="${escapeHtml(assessment.id)}" data-tl-unit="${escapeHtml(unit.id)}" data-tl-degree="${escapeHtml(degree.id)}" style="left:${Math.max(0, left)}px">
    <span class="uni-tl__assessment-title">${escapeHtml(assessment.title)}</span>
    <span class="uni-tl__assessment-grade">${escapeHtml(resolved.grade ?? "Open")}</span>
  </button>`;
}

export function timelineChartHtml(
  degrees: DegreeRecord[],
  camera: TimelineCamera,
  width: number,
  selection: TimelineSelection | null,
) {
  const layer = layerFromCamera(degrees, camera);
  const packed = packLanes(degrees);
  const laneOf = new Map(packed.lanes.map(row => [row.id, row.lane]));
  const ticks = yearTicks(camera.startMs, camera.endMs)
    .filter(tick => tick.ms >= camera.startMs && tick.ms <= camera.endMs)
    .map(tick => {
      const left = xAt(tick.ms, camera.startMs, camera.endMs, width);
      return `<span class="uni-tl__tick" style="left:${left}px">${tick.year}</span>`;
    })
    .join("");

  const lanes = Array.from({ length: packed.laneCount }, (_, lane) => {
    const items = degrees
      .map((degree, index) => ({ degree, index }))
      .filter(item => laneOf.get(item.degree.id) === lane)
      .map(({ degree, index }) => {
        const selectedDegree = selection?.degreeId === degree.id && selection.kind === "degree";
        const units =
          layer === "degrees"
            ? ""
            : degree.units
                .map(unit => {
                  const selectedUnit = selection?.kind !== "degree" && selection?.unitId === unit.id && selection.kind === "unit";
                  const cards =
                    layer !== "assessments" || !unit.assessments.length
                      ? ""
                      : assessmentMarks(unit, unitSpanFor(unit, degree) ?? spanOf(degree)!)
                          .map(item =>
                            assessmentCardHtml(
                              item,
                              unit,
                              degree,
                              camera,
                              width,
                              selection?.kind === "assessment" && selection.assessmentId === item.id,
                            ),
                          )
                          .join("");
                  return `${unitBarHtml(unit, degree, camera, width, selectedUnit)}${cards ? `<div class="uni-tl__assessments">${cards}</div>` : ""}`;
                })
                .join("");
        return `${degreeBarHtml(degree, index, camera, width, selectedDegree)}${units ? `<div class="uni-tl__units">${units}</div>` : ""}`;
      })
      .join("");
    return `<div class="uni-tl__lane is-${layer}">${items}</div>`;
  }).join("");

  return `<div class="uni-tl__axis">${ticks}</div>
    <div class="uni-tl__chart" data-tl-chart style="--tl-width:${width}px">${lanes}</div>`;
}

export function selectionCardHtml(degrees: DegreeRecord[], selection: TimelineSelection | null) {
  if (!selection) return "";
  const degree = findDegree(degrees, selection.degreeId);
  if (!degree) return "";
  if (selection.kind === "degree") {
    return `<article class="uni-tl__card glass-panel" data-tl-card>
      <p class="eyebrow">Degree</p>
      <h2>${escapeHtml(degree.title)}</h2>
      <p>${escapeHtml(degree.institution ?? "Institution not recorded")}</p>
      <p>${escapeHtml(dateLabel(degree.start, degree.end))} · ${escapeHtml(statusLabel(degree.status))}</p>
      <p>${degree.units.length} units</p>
      <button type="button" class="btn btn--ghost" data-tl-dismiss>Close</button>
    </article>`;
  }
  const unit = findUnit(degree, selection.unitId);
  if (!unit) return "";
  if (selection.kind === "unit") {
    return `<article class="uni-tl__card glass-panel" data-tl-card>
      <p class="eyebrow">Unit</p>
      <h2>${escapeHtml(unit.title)}</h2>
      <p>${escapeHtml(degree.title)}</p>
      <p class="uni-tl__card-grade">${escapeHtml(gradeText(unit.grade, unit.gpaPoints))}</p>
      <p>${escapeHtml(dateLabel(unit.start, unit.end))} · ${escapeHtml(statusLabel(unit.status))}</p>
      ${unit.assessments.length ? `<p>${unit.assessments.length} assessment${unit.assessments.length === 1 ? "" : "s"}</p>` : ""}
      <button type="button" class="btn btn--ghost" data-tl-dismiss>Close</button>
    </article>`;
  }
  const assessment = unit.assessments.find(item => item.id === selection.assessmentId);
  if (!assessment) return "";
  const resolved = resolveAssessmentGrade(assessment, unit);
  const source =
    resolved.source === "unit"
      ? `Unit grade for ${unit.code ?? unit.title}`
      : resolved.source === "assessment"
        ? "Assessment grade"
        : "No grade recorded";
  return `<article class="uni-tl__card glass-panel" data-tl-card>
    <p class="eyebrow">${assessment.kind === "test" ? "Test" : "Assessment"}</p>
    <h2>${escapeHtml(assessment.title)}</h2>
    <p>${escapeHtml(unit.title)}</p>
    <p class="uni-tl__card-grade">${escapeHtml(gradeText(resolved.grade, resolved.points))}</p>
    <p class="uni-tl__card-source">${escapeHtml(source)}</p>
    ${assessment.description ? `<p>${escapeHtml(assessment.description)}</p>` : ""}
    <p>${escapeHtml(dateLabel(assessment.start ?? unit.start, assessment.end ?? unit.end))} · ${escapeHtml(statusLabel(assessment.status))}</p>
    <button type="button" class="btn btn--ghost" data-tl-dismiss>Close</button>
  </article>`;
}

export function timelineFrameHtml(degrees: DegreeRecord[], state: TimelineViewState, width: number) {
  const layer = layerFromCamera(degrees, state.camera);
  return `${timelineToolbarHtml(layer)}
    ${gpaChipHtml(degrees, state.includeUngraded, state.gpaOpen)}
    <div class="uni-tl__viewport" data-tl-viewport tabindex="0">
      ${timelineChartHtml(degrees, state.camera, width, state.selection)}
    </div>
    ${selectionCardHtml(degrees, state.selection)}`;
}
