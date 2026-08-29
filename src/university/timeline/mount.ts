import catalogue from "./data.json";
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

  let width = Math.max(480, host.clientWidth - 180);
  let dragging = false;
  let lastX = 0;

  const chartWidth = () => {
    const viewport = host.querySelector<HTMLElement>("[data-tl-viewport]");
    return Math.max(480, (viewport?.clientWidth ?? host.clientWidth) - 8);
  };

  const paint = () => {
    width = chartWidth();
    host.innerHTML = timelineFrameHtml(degrees, state, width);
    bind();
  };

  const zoomBy = (factor: number, focusMs?: number) => {
    const focus = focusMs ?? (state.camera.startMs + state.camera.endMs) / 2;
    state.camera = zoomCamera(state.camera.startMs, state.camera.endMs, focus, factor, bounds);
    paint();
  };

  const select = (selection: TimelineSelection | null) => {
    state.selection = selection;
    paint();
  };

  function bind() {
    const viewport = host.querySelector<HTMLElement>("[data-tl-viewport]");
    const chart = host.querySelector<HTMLElement>("[data-tl-chart]");
    if (!viewport || !chart) return;

    host.querySelectorAll<HTMLButtonElement>("[data-tl-zoom]").forEach(button => {
      button.onclick = () => zoomBy(button.dataset.tlZoom === "-1" ? 1 / 1.45 : 1.45);
    });
    host.querySelector<HTMLButtonElement>("[data-tl-fit]")!.onclick = () => {
      state.camera = { ...bounds };
      state.selection = null;
      paint();
    };
    host.querySelector<HTMLButtonElement>("[data-gpa-toggle]")!.onclick = () => {
      state.gpaOpen = !state.gpaOpen;
      paint();
    };
    const ungraded = host.querySelector<HTMLInputElement>("[data-gpa-ungraded]");
    if (ungraded) {
      ungraded.onchange = () => {
        state.includeUngraded = ungraded.checked;
        state.gpaOpen = true;
        paint();
      };
    }
    host.querySelector<HTMLButtonElement>("[data-tl-dismiss]")?.addEventListener("click", () => select(null));

    host.querySelectorAll<HTMLButtonElement>("[data-tl-degree]").forEach(button => {
      if (button.dataset.tlUnit) return;
      button.onclick = () => {
        const degree = degrees.find(item => item.id === button.dataset.tlDegree);
        const span = degree ? spanOf(degree) : null;
        if (!degree || !span) return;
        state.camera = cameraForLayer(paddedSpan(span.startMs, span.endMs, bounds), bounds, "units", (span.startMs + span.endMs) / 2);
        select({ kind: "degree", degreeId: degree.id });
      };
    });

    host.querySelectorAll<HTMLButtonElement>("[data-tl-unit]").forEach(button => {
      if (button.dataset.tlAssessment) return;
      button.onclick = event => {
        event.stopPropagation();
        const degree = degrees.find(item => item.id === button.dataset.tlDegree);
        const unit = degree?.units.find(item => item.id === button.dataset.tlUnit);
        const span = degree && unit ? unitSpanFor(unit, degree) : null;
        if (!degree || !unit || !span) return;
        state.camera = cameraForLayer(
          paddedSpan(span.startMs, span.endMs, bounds),
          bounds,
          unit.assessments.length ? "assessments" : "units",
          (span.startMs + span.endMs) / 2,
        );
        select({ kind: "unit", degreeId: degree.id, unitId: unit.id });
      };
    });

    host.querySelectorAll<HTMLButtonElement>("[data-tl-assessment]").forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        const degreeId = button.dataset.tlDegree!;
        const unitId = button.dataset.tlUnit!;
        const assessmentId = button.dataset.tlAssessment!;
        select({ kind: "assessment", degreeId, unitId, assessmentId });
      };
    });

    viewport.onwheel = event => {
      event.preventDefault();
      const rect = chart.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const focusMs = state.camera.startMs + (x / Math.max(1, rect.width)) * (state.camera.endMs - state.camera.startMs);
      zoomBy(event.deltaY < 0 ? 1.18 : 1 / 1.18, focusMs);
    };

    viewport.onpointerdown = event => {
      if ((event.target as HTMLElement).closest("button")) return;
      dragging = true;
      lastX = event.clientX;
      viewport.setPointerCapture(event.pointerId);
    };
    viewport.onpointermove = event => {
      if (!dragging) return;
      const rect = chart.getBoundingClientRect();
      const deltaMs = ((lastX - event.clientX) / Math.max(1, rect.width)) * (state.camera.endMs - state.camera.startMs);
      lastX = event.clientX;
      state.camera = panCamera(state.camera.startMs, state.camera.endMs, deltaMs, bounds);
      viewport.innerHTML = timelineChartHtml(degrees, state.camera, chartWidth(), state.selection);
    };
    viewport.onpointerup = () => {
      if (dragging) {
        dragging = false;
        paint();
      }
    };
  }

  const frame = requestAnimationFrame(paint);
  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          const next = chartWidth();
          if (Math.abs(next - width) < 4) return;
          paint();
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
