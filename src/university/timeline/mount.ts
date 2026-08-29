import catalogue from "./data.json";
import { wheelIntent, wheelPanPixels } from "./gestures";
import { cameraForLayer, catalogueSpan, layerForScale, panCamera, spanOf, unitSpanFor, zoomCamera } from "./layout";
import type { DegreeRecord, TimelineCamera, UniversityCatalogue } from "./types";
import { timelineChartHtml, timelineFrameHtml, type TimelineSelection, type TimelineViewState } from "./view";

const PAD = 0.08;

export function paddedSpan(startMs: number, endMs: number, bounds: TimelineCamera): TimelineCamera {
  const span = Math.max(endMs - startMs, 86_400_000 * 20);
  const pad = span * PAD;
  return {
    startMs: Math.max(bounds.startMs, startMs - pad),
    endMs: Math.min(bounds.endMs, endMs + pad),
  };
}

export function mountUniversityTimeline(
  host: HTMLElement,
  data: UniversityCatalogue = catalogue as UniversityCatalogue,
) {
  const degrees = data.degrees as DegreeRecord[];
  const bounds = catalogueSpan(degrees);
  const state: TimelineViewState = {
    camera: { ...bounds },
    includeUngraded: false,
    gpaOpen: false,
    selection: null,
  };

  let width = Math.max(480, host.clientWidth);
  let dragging = false;
  let dragReady = false;
  let suppressClick = false;
  let lastX = 0;
  let originX = 0;
  let bound = false;

  const viewport = () => host.querySelector<HTMLElement>("[data-tl-viewport]");
  const chart = () => host.querySelector<HTMLElement>("[data-tl-chart]");

  const chartWidth = () => Math.max(480, viewport()?.clientWidth ?? host.clientWidth);

  const restoreScroll = (top: number) => {
    const pane = viewport();
    if (pane) pane.scrollTop = top;
  };

  const updateChart = () => {
    const pane = viewport();
    if (!pane) return;
    const top = pane.scrollTop;
    width = chartWidth();
    pane.innerHTML = timelineChartHtml(degrees, state.camera, width, state.selection);
    restoreScroll(top);
  };

  const paint = () => {
    const top = viewport()?.scrollTop ?? 0;
    width = chartWidth();
    host.innerHTML = timelineFrameHtml(degrees, state, width);
    restoreScroll(top);
    bind();
  };

  const zoomBy = (factor: number, focusMs?: number) => {
    const focus = focusMs ?? (state.camera.startMs + state.camera.endMs) / 2;
    state.camera = zoomCamera(state.camera.startMs, state.camera.endMs, focus, factor, bounds);
    updateChart();
    const layer = host.querySelector("[data-tl-layer]");
    if (layer) {
      const scale = (bounds.endMs - bounds.startMs) / Math.max(1, state.camera.endMs - state.camera.startMs);
      const name = scale >= 4.5 ? "assessments" : scale >= 2 ? "units" : "degrees";
      layer.textContent = `Showing ${name}`;
    }
  };

  const select = (selection: TimelineSelection | null) => {
    state.selection = selection;
    paint();
  };

  function bind() {
    if (bound) return;
    bound = true;

    host.addEventListener("click", event => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest("[data-tl-dismiss]")) {
        select(null);
        return;
      }
      if (target.closest("[data-tl-fit]")) {
        state.camera = { ...bounds };
        state.selection = null;
        paint();
        return;
      }
      const zoom = target.closest<HTMLButtonElement>("[data-tl-zoom]");
      if (zoom) {
        zoomBy(zoom.dataset.tlZoom === "-1" ? 1 / 1.45 : 1.45);
        return;
      }
      if (target.closest("[data-gpa-toggle]")) {
        state.gpaOpen = !state.gpaOpen;
        paint();
        return;
      }
      const assessment = target.closest<HTMLButtonElement>("[data-tl-assessment]");
      if (assessment) {
        event.preventDefault();
        select({
          kind: "assessment",
          degreeId: assessment.dataset.tlDegree!,
          unitId: assessment.dataset.tlUnit!,
          assessmentId: assessment.dataset.tlAssessment!,
        });
        return;
      }
      const unit = target.closest<HTMLButtonElement>("[data-tl-unit]");
      if (unit) {
        event.preventDefault();
        const degree = degrees.find(item => item.id === unit.dataset.tlDegree);
        const record = degree?.units.find(item => item.id === unit.dataset.tlUnit);
        const span = degree && record ? unitSpanFor(record, degree) : null;
        if (!degree || !record || !span) return;
        state.camera = cameraForLayer(
          paddedSpan(span.startMs, span.endMs, bounds),
          bounds,
          record.assessments.length ? "assessments" : "units",
          (span.startMs + span.endMs) / 2,
        );
        select({ kind: "unit", degreeId: degree.id, unitId: record.id });
        return;
      }
      const degreeBtn = target.closest<HTMLButtonElement>("[data-tl-degree]");
      if (degreeBtn) {
        const degree = degrees.find(item => item.id === degreeBtn.dataset.tlDegree);
        const span = degree ? spanOf(degree) : null;
        if (!degree || !span) return;
        state.camera = cameraForLayer(paddedSpan(span.startMs, span.endMs, bounds), bounds, "units", (span.startMs + span.endMs) / 2);
        select({ kind: "degree", degreeId: degree.id });
      }
    });

    host.addEventListener("change", event => {
      const box = (event.target as HTMLElement).closest<HTMLInputElement>("[data-gpa-ungraded]");
      if (!box) return;
      state.includeUngraded = box.checked;
      state.gpaOpen = true;
      paint();
    });

    host.addEventListener(
      "wheel",
      event => {
        if (!(event.target as HTMLElement).closest("[data-tl-viewport]")) return;
        const intent = wheelIntent(event);
        if (intent === "scroll") return;
        event.preventDefault();
        const pane = chart();
        const rect = pane?.getBoundingClientRect();
        const span = state.camera.endMs - state.camera.startMs;
        if (intent === "zoom") {
          const x = rect ? event.clientX - rect.left : (rect?.width ?? width) / 2;
          const focusMs = state.camera.startMs + (x / Math.max(1, rect?.width ?? width)) * span;
          zoomBy(event.deltaY < 0 ? 1.18 : 1 / 1.18, focusMs);
          return;
        }
        const pixels = wheelPanPixels(event);
        state.camera = panCamera(state.camera.startMs, state.camera.endMs, (pixels / Math.max(1, rect?.width ?? width)) * span, bounds);
        updateChart();
      },
      { passive: false },
    );

    host.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      if (!(event.target as HTMLElement).closest("[data-tl-viewport]")) return;
      if ((event.target as HTMLElement).closest(".gpa-chip, .uni-tl__card, .uni-tl__toolbar")) return;
      dragReady = true;
      dragging = false;
      lastX = event.clientX;
      originX = event.clientX;
      viewport()?.setPointerCapture(event.pointerId);
    });

    host.addEventListener("pointermove", event => {
      if (!dragReady) return;
      if (!dragging && Math.abs(event.clientX - originX) < 6) return;
      dragging = true;
      const rect = chart()?.getBoundingClientRect();
      const span = state.camera.endMs - state.camera.startMs;
      const deltaMs = ((lastX - event.clientX) / Math.max(1, rect?.width ?? width)) * span;
      lastX = event.clientX;
      state.camera = panCamera(state.camera.startMs, state.camera.endMs, deltaMs, bounds);
      updateChart();
    });

    host.addEventListener("pointerup", () => {
      const wasDragging = dragging;
      dragReady = false;
      dragging = false;
      if (wasDragging) suppressClick = true;
    });
  }

  const frame = requestAnimationFrame(paint);
  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          const next = chartWidth();
          if (Math.abs(next - width) < 4) return;
          updateChart();
        });
  observer?.observe(host);

  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    host.replaceChildren();
  };
}

export function debugLayer(degrees: DegreeRecord[], camera: TimelineCamera) {
  const bounds = catalogueSpan(degrees);
  return layerForScale((bounds.endMs - bounds.startMs) / Math.max(1, camera.endMs - camera.startMs));
}
