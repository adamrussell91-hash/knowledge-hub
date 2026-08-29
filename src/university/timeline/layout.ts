import type { AssessmentRecord, DegreeRecord, UnitRecord, ZoomLayer } from "./types";

export const UNIT_SCALE = 2;
export const ASSESSMENT_SCALE = 4.5;
export const MIN_SCALE = 1;
export const MAX_SCALE = 10;

const DAY = 86_400_000;

export function layerForScale(scale: number): ZoomLayer {
  if (scale >= ASSESSMENT_SCALE) return "assessments";
  if (scale >= UNIT_SCALE) return "units";
  return "degrees";
}

export function scaleOf(view: { startMs: number; endMs: number }, bounds: { startMs: number; endMs: number }) {
  return (bounds.endMs - bounds.startMs) / Math.max(1, view.endMs - view.startMs);
}

export function cameraForLayer(
  view: { startMs: number; endMs: number },
  bounds: { startMs: number; endMs: number },
  layer: ZoomLayer,
  focusMs?: number,
) {
  const need = layer === "assessments" ? ASSESSMENT_SCALE : layer === "units" ? UNIT_SCALE : 1;
  const scale = scaleOf(view, bounds);
  if (scale >= need) return view;
  const focus = focusMs ?? (view.startMs + view.endMs) / 2;
  return zoomCamera(view.startMs, view.endMs, focus, (need * 1.08) / scale, bounds);
}

export function scaleLabel(layer: ZoomLayer) {
  if (layer === "assessments") return "Assessments";
  if (layer === "units") return "Units";
  return "Degrees";
}

export function parseDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(ms) ? null : ms;
}

export function spanOf(item: { start: string | null; end: string | null }, fallback?: { startMs: number; endMs: number }) {
  const start = parseDay(item.start) ?? fallback?.startMs ?? null;
  const rawEnd = parseDay(item.end);
  const end = rawEnd ?? start ?? fallback?.endMs ?? null;
  if (start == null || end == null) return null;
  return { startMs: start, endMs: Math.max(end, start + DAY) };
}

export function catalogueSpan(degrees: DegreeRecord[]) {
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  for (const degree of degrees) {
    const degreeSpan = spanOf(degree);
    if (degreeSpan) {
      startMs = Math.min(startMs, degreeSpan.startMs);
      endMs = Math.max(endMs, degreeSpan.endMs);
    }
    for (const unit of degree.units) {
      const unitSpan = spanOf(unit, degreeSpan ?? undefined);
      if (!unitSpan) continue;
      startMs = Math.min(startMs, unitSpan.startMs);
      endMs = Math.max(endMs, unitSpan.endMs);
    }
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    const now = Date.now();
    return { startMs: now - DAY * 365, endMs: now };
  }
  const pad = Math.max((endMs - startMs) * 0.04, DAY * 40);
  return { startMs: startMs - pad, endMs: endMs + pad };
}

export function xAt(ms: number, viewStart: number, viewEnd: number, width: number) {
  if (viewEnd <= viewStart) return 0;
  return ((ms - viewStart) / (viewEnd - viewStart)) * width;
}

export function msAt(x: number, viewStart: number, viewEnd: number, width: number) {
  if (width <= 0) return viewStart;
  return viewStart + (x / width) * (viewEnd - viewStart);
}

export function zoomCamera(
  viewStart: number,
  viewEnd: number,
  focusMs: number,
  factor: number,
  bounds: { startMs: number; endMs: number },
) {
  const span = viewEnd - viewStart;
  const nextSpan = Math.min(bounds.endMs - bounds.startMs, Math.max(DAY * 40, span / factor));
  const ratio = (focusMs - viewStart) / span;
  let startMs = focusMs - nextSpan * ratio;
  let endMs = startMs + nextSpan;
  if (startMs < bounds.startMs) {
    startMs = bounds.startMs;
    endMs = startMs + nextSpan;
  }
  if (endMs > bounds.endMs) {
    endMs = bounds.endMs;
    startMs = endMs - nextSpan;
  }
  return { startMs, endMs };
}

export function panCamera(viewStart: number, viewEnd: number, deltaMs: number, bounds: { startMs: number; endMs: number }) {
  const span = viewEnd - viewStart;
  let startMs = viewStart + deltaMs;
  let endMs = startMs + span;
  if (startMs < bounds.startMs) {
    startMs = bounds.startMs;
    endMs = startMs + span;
  }
  if (endMs > bounds.endMs) {
    endMs = bounds.endMs;
    startMs = endMs - span;
  }
  return { startMs, endMs };
}

export function yearTicks(viewStart: number, viewEnd: number) {
  const startYear = new Date(viewStart).getUTCFullYear();
  const endYear = new Date(viewEnd).getUTCFullYear();
  const ticks: { year: number; ms: number }[] = [];
  for (let year = startYear; year <= endYear + 1; year += 1) {
    ticks.push({ year, ms: Date.UTC(year, 0, 1) });
  }
  return ticks;
}

export type PackedLane = { id: string; lane: number };

export function packLanes(degrees: DegreeRecord[]): { lanes: PackedLane[]; laneCount: number } {
  const items = degrees
    .map(degree => ({ degree, span: spanOf(degree) ?? { startMs: 0, endMs: 1 } }))
    .sort((a, b) => a.span.startMs - b.span.startMs || a.span.endMs - b.span.endMs);
  const laneEnds: number[] = [];
  const lanes: PackedLane[] = [];
  for (const item of items) {
    let lane = laneEnds.findIndex(end => end <= item.span.startMs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.span.endMs);
    } else {
      laneEnds[lane] = item.span.endMs;
    }
    lanes.push({ id: item.degree.id, lane });
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}

export function assessmentMarks(unit: UnitRecord, unitSpan: { startMs: number; endMs: number }): Array<AssessmentRecord & { startMs: number; endMs: number }> {
  const count = Math.max(1, unit.assessments.length);
  const width = Math.max(DAY * 10, (unitSpan.endMs - unitSpan.startMs) / (count + 1));
  return unit.assessments.map((item, index) => {
    const own = spanOf(item);
    if (own) return { ...item, ...own };
    const startMs = unitSpan.startMs + ((index + 1) / (count + 1)) * (unitSpan.endMs - unitSpan.startMs) - width / 2;
    return { ...item, startMs, endMs: startMs + width };
  });
}

export function unitSpanFor(unit: UnitRecord, degree: DegreeRecord) {
  return spanOf(unit, spanOf(degree) ?? undefined);
}

export function visibleOverlap(
  startMs: number,
  endMs: number,
  viewStart: number,
  viewEnd: number,
) {
  return endMs >= viewStart && startMs <= viewEnd;
}
