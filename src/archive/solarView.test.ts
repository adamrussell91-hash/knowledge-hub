/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { buildSolarModel, worldPositions, type Body } from "./solarModel";
import {
  UNIVERSE_BUILD,
  KIND_DEPTH,
  advanceOrbitClock,
  applySolarStageResize,
  cameraFromWorld,
  fillDots,
  glowSpread,
  isNarrowViewport,
  mountSolarView,
  pinchDistance,
  pinchMidpoint,
  presence,
  resolveSearchHits,
  searchResolveStats,
  solarCamera,
  solarScales,
  solarStageSize,
  solarZoomClamp,
  zoomBand,
} from "./solarView";

function page(id: string, title: string, tags: string[]): PageManifestEntry {
  return { id, title, area: "notes", tags, excerpt: "" };
}

function tagged(prefix: string, tag: string, n: number, titleAt = (i: number) => `${tag} ${i}`) {
  return Array.from({ length: n }, (_, i) => page(`${prefix}${i}`, titleAt(i), [tag]));
}

const V0 = TOPIC_VOCABULARY[0];

function planetBody(partial: Partial<Body> = {}): Body {
  return {
    idx: 0,
    id: "planet:Test",
    kind: "planet",
    label: "Test",
    parent: 0,
    count: 100,
    r: 12,
    sysR: 80,
    a: 420,
    phase: 0,
    period: 300,
    e: 0,
    argP: 0,
    incline: 0,
    color: "#7eb0d5",
    ink: "#315875",
    children: [],
    ...partial,
  };
}

type Arc = { x: number; y: number; r: number; start: number; end: number };

// Mirrors the browser Path2D API: arcs added to a path are batched, and
// filling the path with one ctx.fill(path) call paints their union in one
// pass. jsdom has no Path2D at all, which is exactly how the real "arcs fuse
// into a flat-alpha union polygon" bug shipped three times without a failing
// test — fillDots silently took the always-correct per-dot fallback branch
// in every test run. Stubbing Path2D here closes that blind spot: it lets a
// regression back to path-batched fills show up as a fillGroups entry > 1.
class FakePath2D {
  count = 0;
  arc(_x: number, _y: number, _r: number, _start: number, _end: number) {
    this.count += 1;
  }
}

function recordingContext() {
  const arcs: Arc[] = [];
  const fullCircleStrokes: Arc[] = [];
  const images: Array<{ w: number; h: number }> = [];
  const fillGroups: number[] = [];
  let pending: Arc | null = null;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {
      pending = null;
    },
    arc(x: number, y: number, r: number, start: number, end: number) {
      pending = { x, y, r, start, end };
      arcs.push(pending);
    },
    fill(path?: FakePath2D) {
      fillGroups.push(path ? path.count : pending ? 1 : 0);
    },
    stroke() {
      if (!pending) return;
      if (Math.abs(pending.end - pending.start) >= Math.PI * 2 - 1e-6) fullCircleStrokes.push(pending);
    },
    fillText() {},
    strokeText() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    drawImage(_img: unknown, _x: number, _y: number, w: number, h: number) {
      images.push({ w, h });
    },
    measureText(text: string) {
      return { width: text.length * 6 };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  return { ctx, arcs, fullCircleStrokes, images, fillGroups };
}

function installCanvas() {
  const recorded = recordingContext();
  HTMLCanvasElement.prototype.getContext = function () {
    return recorded.ctx as unknown as CanvasRenderingContext2D;
  };
  vi.stubGlobal("Path2D", FakePath2D);
  return recorded;
}

function stubFrame() {
  const callbacks: FrameRequestCallback[] = [];
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    id += 1;
    callbacks.push(cb);
    return id;
  });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  return {
    callbacks,
    cancel,
    pump(now = 16) {
      const cb = callbacks.at(-1);
      cb?.(now);
    },
  };
}

function worldPos(body: Body, model: ReturnType<typeof buildSolarModel>) {
  const pos = worldPositions(model.bodies, 0);
  return { x: pos.x[body.idx]!, y: pos.y[body.idx]! };
}

describe("presence and bands", () => {
  it("exposes a build number so a stale Universe bundle is obvious", () => {
    expect(UNIVERSE_BUILD).toBe(20);
  });

  it("maps band thresholds onto KIND_DEPTH cutoffs", () => {
    expect(KIND_DEPTH.sun).toBe(0);
    expect(KIND_DEPTH.planet).toBe(0);
    expect(KIND_DEPTH.rock).toBe(0);
    expect(KIND_DEPTH.minor).toBe(0);
    expect(KIND_DEPTH.moon).toBe(0);
    expect(KIND_DEPTH.page).toBe(1);
    expect(zoomBand(0)).toBe(0);
    expect(zoomBand(2.39)).toBe(0);
    expect(zoomBand(2.4)).toBe(1);
    expect(zoomBand(8.9)).toBe(1);
    expect(zoomBand(9)).toBe(2);
    expect(zoomBand(44)).toBe(2);
    expect(zoomBand(45)).toBe(3);
  });

  it("is monotonic in z and never returns below the screen-space floor", () => {
    const planet = planetBody();
    const k = 0.04;
    const samples = Array.from({ length: 20 }, (_, i) => presence(planet, i, k, 100));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]! + 1e-9);
    }
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(3 / k);
    expect(presence(planetBody({ kind: "page", r: 0.85, sysR: 0.85 }), 1, k, 100)).toBeGreaterThanOrEqual(
      2.4 / k,
    );
    expect(presence(planetBody({ kind: "moon", r: 2, sysR: 8, count: 12 }), 1, k, 100)).toBeGreaterThanOrEqual(
      4.2 / k,
    );
    const giant = planetBody({ giant: true, count: 200 });
    const ordinary = planetBody({ count: 40 });
    expect(presence(giant, 1, k, 200)).toBeGreaterThan(presence(ordinary, 1, k, 200) * 1.6);
  });

  it("holds planet glow off until you zoom in", () => {
    const k = 0.05;
    const ordinary = presence(planetBody({ count: 80 }), 1, k, 100);
    const giant = presence(planetBody({ giant: true, count: 200 }), 1, k, 200);
    // Loose sanity bounds — the tight, load-bearing size relationships are
    // covered by the fit-zoom hierarchy test below.
    expect(ordinary * k).toBeLessThan(30);
    expect(giant * k).toBeLessThan(40);
    expect(glowSpread(1, false)).toBe(0);
    expect(glowSpread(2.39, true)).toBe(0);
    expect(glowSpread(2.4, false)).toBe(2.1);
    expect(glowSpread(2.4, true)).toBe(2.6);
  });

  it("reads as a solar system at fit zoom: sun and giant anchor it, debris stays smallest", () => {
    // This is the actual complaint this fix addresses: at fit zoom the sun
    // was the same screen size as a page or rock, and moons could render
    // bigger than the planets that host them, because each kind's floor was
    // picked independently instead of against a shared hierarchy.
    const z = 0;
    const k = 0.02;
    const tag = 200;
    const sun = presence(planetBody({ kind: "sun", r: 26 }), z, k, tag);
    const planet = presence(planetBody({ kind: "planet", count: 120, r: 12 }), z, k, tag);
    const giant = presence(planetBody({ kind: "planet", giant: true, count: 120, r: 30 }), z, k, tag);
    const minor = presence(planetBody({ kind: "minor", count: 40, r: 3.4 }), z, k, tag);
    const moon = presence(planetBody({ kind: "moon", count: 4, r: 2 }), z, k, tag);
    const page = presence(planetBody({ kind: "page", r: 0.85 }), z, k, tag);
    const rock = presence(planetBody({ kind: "rock", r: 1.1 }), z, k, tag);

    expect(sun).toBeGreaterThan(planet);
    expect(giant).toBeGreaterThan(planet);
    expect(planet).toBeGreaterThan(minor);
    expect(minor).toBeGreaterThan(moon);
    expect(moon).toBeGreaterThan(page);
    expect(moon).toBeGreaterThan(rock);
  });
});

describe("mobile-only universe camera", () => {
  it("keeps the desktop stage on the 720px floor", () => {
    expect(isNarrowViewport(1280)).toBe(false);
    expect(solarStageSize({ clientWidth: 800, clientHeight: 0 }, { innerWidth: 1280, innerHeight: 900 })).toEqual({
      width: 800,
      height: 720,
    });
    expect(solarStageSize({ clientWidth: 1100, clientHeight: 400 }, { innerWidth: 1440, innerHeight: 1000 })).toEqual({
      width: 1100,
      height: 800,
    });
  });

  it("sizes a phone stage from the leftover viewport instead of a 720px floor", () => {
    expect(isNarrowViewport(390)).toBe(true);
    expect(solarStageSize({ clientWidth: 390, clientHeight: 520 }, { innerWidth: 390, innerHeight: 844 })).toEqual({
      width: 390,
      height: 520,
    });
    expect(solarStageSize({ clientWidth: 390, clientHeight: 0 }, { innerWidth: 390, innerHeight: 667 }).height).toBeLessThan(
      720,
    );
  });

  it("keeps wheel-zoom camera math", () => {
    const world = { x: 100, y: 40 };
    expect(cameraFromWorld(world, 1.08, 200, 160, { left: 0, top: 0 })).toEqual({
      k: 1.08,
      x: 200 - 100 * 1.08,
      y: 160 - 40 * 1.08,
    });
    expect(pinchDistance({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(50);
    expect(pinchMidpoint({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 20, y: 30 });
  });
});

describe("zoom ladder", () => {
  it("derives kMax from content and keeps the fit-to-max range at most 400:1", () => {
    const { fitK, kMin, kMax } = solarScales(3400, 8, 1440, 900);
    expect(kMin).toBeCloseTo(fitK * 0.85);
    expect(kMax / fitK).toBeLessThanOrEqual(400);
    expect(solarZoomClamp(1e-9, kMin, kMax)).toBe(kMin);
    expect(solarZoomClamp(kMax + 10, kMin, kMax)).toBe(kMax);
  });

  it("centres the camera on a world point", () => {
    const camera = solarCamera({ x: 0, y: 0 }, 0.2, 800, 720);
    expect(camera.x).toBeCloseTo(400);
    expect(camera.y).toBeCloseTo(360);
  });

  it("keeps the same world focus and relative zoom when the stage grows", () => {
    const scales = solarScales(3400, 8, 800, 720);
    const prev = { width: 800, height: 720, ...scales, k: scales.fitK * 2, x: 100, y: 80 };
    const focusX = (prev.width / 2 - prev.x) / prev.k;
    const focusY = (prev.height / 2 - prev.y) / prev.k;
    const next = applySolarStageResize(prev, { width: 1400, height: 900 }, 3400, 8);
    expect(next.width).toBe(1400);
    expect(next.height).toBe(900);
    expect(next.k / next.fitK).toBeCloseTo(2);
    expect((next.width / 2 - next.x) / next.k).toBeCloseTo(focusX);
    expect((next.height / 2 - next.y) / next.k).toBeCloseTo(focusY);
    expect(applySolarStageResize(prev, { width: 0, height: 0 }, 3400, 8)).toBe(prev);
    expect(applySolarStageResize(prev, { width: 800, height: 720 }, 3400, 8)).toBe(prev);
  });

  it("advances the orbit clock from the speed control without jumping", () => {
    expect(advanceOrbitClock(0, 10000, 0.25, false)).toBe(2.5);
    expect(advanceOrbitClock(2.5, 1000, 1, false)).toBe(3.5);
    expect(advanceOrbitClock(5, 2000, 2, true)).toBe(0);
  });
});

describe("search hits", () => {
  it("resolves matching body indices once per query, never the sun", () => {
    const model = buildSolarModel(tagged("g", V0, 12, i => (i === 0 ? "Alpha note" : `Note ${i}`)));
    const hits = resolveSearchHits(model, "alpha");
    expect(hits.size).toBeGreaterThan(0);
    expect([...hits].every(idx => model.bodies[idx]?.kind !== "sun")).toBe(true);
    expect(resolveSearchHits(model, "   ").size).toBe(0);
  });
});

describe("fillDots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fills each overlapping same-color dot on its own path instead of unioning them into one shape", () => {
    const recorded = installCanvas();
    const dots = Array.from({ length: 6 }, (_, i) => ({
      x: i * 2,
      y: 0,
      r: 6,
      color: "#8a5fd6",
      alpha: 0.4,
    }));
    fillDots(recorded.ctx as unknown as CanvasRenderingContext2D, dots);
    expect(recorded.fillGroups).toHaveLength(dots.length);
    expect(recorded.fillGroups.every(count => count === 1)).toBe(true);
  });
});

describe("mountSolarView", () => {
  beforeEach(() => {
    searchResolveStats.calls = 0;
    installCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a ringed giant with filled dust, never a stroked orbit circle", () => {
    const recorded = installCanvas();
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const entries = [
      ...tagged("common", TOPIC_VOCABULARY[1]!, 80),
      ...tagged("common2", TOPIC_VOCABULARY[2]!, 80),
      ...tagged("common3", TOPIC_VOCABULARY[3]!, 80),
      ...Array.from({ length: 18 }, (_, i) => page(`solo${i}`, `Solo ${i}`, [V0])),
      ...Array.from({ length: 16 }, (_, i) => page(`m1${i}`, `Moon1 ${i}`, [V0, TOPIC_VOCABULARY[1]!])),
      ...Array.from({ length: 14 }, (_, i) => page(`m2${i}`, `Moon2 ${i}`, [V0, TOPIC_VOCABULARY[2]!])),
      ...Array.from({ length: 12 }, (_, i) => page(`m3${i}`, `Moon3 ${i}`, [V0, TOPIC_VOCABULARY[3]!])),
    ];
    const model = buildSolarModel(entries);
    expect(model.planets.some(planet => planet.giant && planet.ringed)).toBe(true);
    const stop = mountSolarView(host, model, { search: "", onNoteSelect() {} });
    frames.pump(16);
    expect(recorded.fullCircleStrokes).toHaveLength(0);
    expect(recorded.arcs.length).toBeGreaterThan(20);
    stop();
  });

  it("skips additive planet glow at fit zoom so discs do not merge into shards", () => {
    const recorded = installCanvas();
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const entries = [
      ...tagged("common", TOPIC_VOCABULARY[1]!, 80),
      ...tagged("common2", TOPIC_VOCABULARY[2]!, 80),
      ...tagged("common3", TOPIC_VOCABULARY[3]!, 80),
    ];
    const model = buildSolarModel(entries);
    expect(model.planets.length).toBeGreaterThan(1);
    const stop = mountSolarView(host, model, { search: "", onNoteSelect() {} });
    frames.pump(16);
    expect(recorded.images).toHaveLength(1);
    stop();
  });

  it("never strokes a full-circle arc centred on a parent body", () => {
    const recorded = installCanvas();
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const stop = mountSolarView(host, buildSolarModel(tagged("g", V0, 12)), {
      search: "",
      onNoteSelect() {},
    });
    frames.pump(16);
    expect(recorded.fullCircleStrokes).toHaveLength(0);
    stop();
  });

  it("resolves search hits once per query change, not per frame", () => {
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const model = buildSolarModel(tagged("g", V0, 12));
    const stop = mountSolarView(host, model, { search: "", onNoteSelect() {} });
    frames.pump(16);
    const afterMount = searchResolveStats.calls;
    expect(afterMount).toBeGreaterThanOrEqual(1);
    frames.pump(32);
    frames.pump(48);
    expect(searchResolveStats.calls).toBe(afterMount);
    stop.setSearch("gifted");
    expect(searchResolveStats.calls).toBe(afterMount + 1);
    frames.pump(64);
    frames.pump(80);
    expect(searchResolveStats.calls).toBe(afterMount + 1);
    stop.setSearch("gifted");
    expect(searchResolveStats.calls).toBe(afterMount + 1);
    stop();
  });

  it("cancels its animation frame on teardown and keeps setSearch on the same canvas", () => {
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const stop = mountSolarView(host, buildSolarModel([]), { search: "", onNoteSelect() {} });
    const canvas = host.children[0];
    const firstId = frames.callbacks.length;
    stop.setSearch("zzz");
    expect(host.children[0]).toBe(canvas);
    stop();
    expect(frames.cancel).toHaveBeenCalled();
    expect(frames.callbacks.length).toBe(firstId);
  });

  it("clicks a searched page and fires onNoteSelect with pageId, title, and excerpt", () => {
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const entries = tagged("g", V0, 12, i => (i === 0 ? "Zebra Unique Page" : `Note ${i}`));
    entries[0]!.excerpt = "zebra excerpt";
    const model = buildSolarModel(entries);
    const onNoteSelect = vi.fn();
    const stop = mountSolarView(host, model, { search: "Zebra Unique", onNoteSelect });
    frames.pump(16);
    const target = model.bodies.find(body => body.pageId === "g0")!;
    const world = worldPos(target, model);
    const width = 800;
    const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
    const { fitK } = solarScales(model.reach, model.tightest, width, height);
    const sx = width / 2 + world.x * fitK;
    const sy = height / 2 + world.y * fitK;
    const canvas = host.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {},
    });
    canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: sx, clientY: sy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: sx, clientY: sy, bubbles: true }));
    expect(onNoteSelect).toHaveBeenCalledWith({
      pageId: "g0",
      title: "Zebra Unique Page",
      excerpt: "zebra excerpt",
    });
    stop();
  });

  it("does not mount zoom buttons on a desktop-width window", () => {
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const stop = mountSolarView(host, buildSolarModel([]), { search: "", onNoteSelect() {} });
    expect(host.querySelector(".universe-zoom")).toBeNull();
    stop();
  });

  it("resizes the existing canvas when the host grows and disconnects the observer on teardown", () => {
    const callbacks: Array<() => void> = [];
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true, writable: true });
    Object.defineProperty(host, "clientHeight", { value: 720, configurable: true, writable: true });
    const stop = mountSolarView(host, buildSolarModel([]), { search: "", onNoteSelect() {} });
    const canvas = host.querySelector("canvas")!;
    expect(canvas.style.width).toBe("800px");
    Object.defineProperty(host, "clientWidth", { value: 1400, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 900, configurable: true });
    callbacks.at(-1)?.();
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(canvas.style.width).toBe("1400px");
    expect(canvas.style.height).toBe("900px");
    stop();
    expect(disconnect).toHaveBeenCalled();
  });

  it("mounts pinch-safe zoom buttons only on a narrow window", () => {
    vi.stubGlobal("innerWidth", 390);
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 390, configurable: true });
    const stop = mountSolarView(host, buildSolarModel([]), { search: "", onNoteSelect() {} });
    expect(host.querySelector(".universe-zoom")).toBeTruthy();
    expect(host.querySelectorAll("[data-universe-zoom]")).toHaveLength(2);
    stop();
  });

  it("still selects a searched page after the stage is resized", () => {
    const callbacks: Array<() => void> = [];
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 720, configurable: true });
    const entries = tagged("g", V0, 12, i => (i === 0 ? "Zebra Unique Page" : `Note ${i}`));
    entries[0]!.excerpt = "zebra excerpt";
    const model = buildSolarModel(entries);
    const onNoteSelect = vi.fn();
    const stop = mountSolarView(host, model, { search: "Zebra Unique", onNoteSelect });
    Object.defineProperty(host, "clientWidth", { value: 1400, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 900, configurable: true });
    callbacks.at(-1)?.();
    frames.pump(16);
    const target = model.bodies.find(body => body.pageId === "g0")!;
    const world = worldPos(target, model);
    const width = 1400;
    const height = 900;
    const { fitK } = solarScales(model.reach, model.tightest, width, height);
    const next = applySolarStageResize(
      {
        width: 800,
        height: 720,
        ...solarScales(model.reach, model.tightest, 800, 720),
        k: solarScales(model.reach, model.tightest, 800, 720).fitK,
        x: 400,
        y: 360,
      },
      { width, height },
      model.reach,
      model.tightest,
    );
    const sx = next.x + world.x * next.k;
    const sy = next.y + world.y * next.k;
    const canvas = host.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {},
    });
    canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: sx, clientY: sy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: sx, clientY: sy, bubbles: true }));
    expect(onNoteSelect).toHaveBeenCalledWith({
      pageId: "g0",
      title: "Zebra Unique Page",
      excerpt: "zebra excerpt",
    });
    expect(fitK).toBeGreaterThan(0);
    stop();
  });

  it("treats a two-finger pinch as zoom, not a note click", () => {
    const frames = stubFrame();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const entries = tagged("g", V0, 12, i => (i === 0 ? "Zebra Unique Page" : `Note ${i}`));
    const model = buildSolarModel(entries);
    const onNoteSelect = vi.fn();
    const stop = mountSolarView(host, model, { search: "Zebra Unique", onNoteSelect });
    frames.pump(16);
    const target = model.bodies.find(body => body.pageId === "g0")!;
    const world = worldPos(target, model);
    const width = 800;
    const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
    const { fitK } = solarScales(model.reach, model.tightest, width, height);
    const sx = width / 2 + world.x * fitK;
    const sy = height / 2 + world.y * fitK;
    const canvas = host.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      return event;
    };
    canvas.dispatchEvent(pointer("pointerdown", 1, sx, sy));
    canvas.dispatchEvent(pointer("pointerdown", 2, sx + 40, sy));
    window.dispatchEvent(pointer("pointermove", 2, sx + 90, sy));
    window.dispatchEvent(pointer("pointerup", 1, sx, sy));
    window.dispatchEvent(pointer("pointerup", 2, sx + 90, sy));
    expect(onNoteSelect).not.toHaveBeenCalled();
    stop();
  });
});
