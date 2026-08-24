import { attachGraphSearch, type GraphMount } from "./forceGraphBehavior";
import { hashUnit, worldPositions, type Body, type BodyKind, type SolarModel } from "./solarModel";

export const UNIVERSE_BUILD = 20;

export type SolarNotePayload = { pageId: string; title: string; excerpt: string };

export type SolarViewOptions = {
  search: string;
  onNoteSelect: (note: SolarNotePayload | null) => void;
  clock?: { speed: number };
};

export const KIND_DEPTH: Record<BodyKind, number> = {
  sun: 0,
  planet: 0,
  rock: 0,
  minor: 0,
  moon: 0,
  page: 1,
};

export const searchResolveStats = { calls: 0 };

const TAU = Math.PI * 2;

export function zoomBand(z: number) {
  if (z < 2.4) return 0;
  if (z < 9) return 1;
  if (z < 45) return 2;
  return 3;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// Screen-space floor per kind, in pixels — the minimum size a body renders
// at even when it's too small (or too zoomed out) to read at true scale.
// These mirror the actual world-space size hierarchy from solarModel.ts
// (sun r=26 > planet/giant > minor > moon > page/rock), compressed enough
// that debris stays visible without making the sun the same size as a note.
// Getting this ordering wrong is exactly what made fit-zoom look like a flat
// pile of same-size dots instead of a solar system.
const SUN_FLOOR_PX = 15;
const PLANET_FLOOR_PX = 8.6;
const MINOR_FLOOR_PX = 6.2;
const MOON_FLOOR_PX = 4.2;
const DEBRIS_FLOOR_PX = 2.4;

export function presence(body: Body, z: number, k: number, maxTag: number) {
  const safeK = Math.max(k, 1e-9);
  const tag = Math.max(maxTag, 1);
  if (body.kind === "sun") {
    return Math.max(body.r, SUN_FLOOR_PX / safeK);
  }
  if (body.kind === "page" || body.kind === "rock") {
    return Math.max(body.r, DEBRIS_FLOOR_PX / safeK);
  }
  if (body.kind === "moon") {
    return Math.max(body.r, MOON_FLOOR_PX / safeK);
  }
  let t: number;
  let big: number;
  if (body.kind === "planet") {
    t = clamp01((z - 2.4) / 7);
    big = (PLANET_FLOOR_PX + Math.sqrt(body.count / tag) * 5) / safeK;
    if (body.giant) big *= 1.7;
  } else if (body.kind === "minor") {
    t = clamp01((z - 2.4) / 12);
    big = (MINOR_FLOOR_PX + Math.sqrt(body.count / tag) * 6) / safeK;
  } else {
    return Math.max(body.r, DEBRIS_FLOOR_PX / safeK);
  }
  return Math.max(big + (body.r - big) * t, 3 / safeK);
}

export function solarScales(reach: number, tightest: number, width: number, height: number) {
  const span = Math.min(width, height);
  const fitK = (span * 0.9) / Math.max(reach * 2, 1);
  const kMin = fitK * 0.85;
  const derived = (span * 0.7) / Math.max(tightest * 2, 1e-6);
  const kMax = Math.max(kMin * 1.0001, Math.min(derived, fitK * 400));
  return { fitK, kMin, kMax };
}

export function solarZoomClamp(k: number, kMin: number, kMax: number) {
  return Math.min(kMax, Math.max(kMin, k));
}

export function solarCamera(focus: { x: number; y: number }, k: number, width: number, height: number) {
  return { k, x: width / 2 - focus.x * k, y: height / 2 - focus.y * k };
}

export type SolarStageCamera = {
  width: number;
  height: number;
  fitK: number;
  kMin: number;
  kMax: number;
  k: number;
  x: number;
  y: number;
};

/** Keep the same world focus and relative zoom when the stage is resized (fullscreen). */
export function applySolarStageResize(
  prev: SolarStageCamera,
  nextSize: { width: number; height: number },
  reach: number,
  tightest: number,
): SolarStageCamera {
  if (nextSize.width < 32 || nextSize.height < 32) return prev;
  if (nextSize.width === prev.width && nextSize.height === prev.height) return prev;
  const z = prev.k / Math.max(prev.fitK, 1e-9);
  const focusX = (prev.width / 2 - prev.x) / Math.max(prev.k, 1e-9);
  const focusY = (prev.height / 2 - prev.y) / Math.max(prev.k, 1e-9);
  const scales = solarScales(reach, tightest, nextSize.width, nextSize.height);
  const k = solarZoomClamp(z * scales.fitK, scales.kMin, scales.kMax);
  return {
    width: nextSize.width,
    height: nextSize.height,
    ...scales,
    k,
    x: nextSize.width / 2 - focusX * k,
    y: nextSize.height / 2 - focusY * k,
  };
}

const NARROW_VIEWPORT_PX = 720;

export function isNarrowViewport(innerWidth: number) {
  return innerWidth <= NARROW_VIEWPORT_PX;
}

/** Desktop canvas size is unchanged. Phones use the leftover viewport, not a 720px floor. */
export function solarStageSize(
  host: { clientWidth: number; clientHeight: number },
  viewport: { innerWidth: number; innerHeight: number },
) {
  const width = host.clientWidth || 1100;
  if (isNarrowViewport(viewport.innerWidth)) {
    const fallback = Math.max(360, Math.floor(viewport.innerHeight * 0.58));
    return { width, height: Math.max(host.clientHeight || 0, fallback) };
  }
  return { width, height: Math.max(720, Math.floor(viewport.innerHeight * 0.8)) };
}

export function cameraFromWorld(
  world: { x: number; y: number },
  nextK: number,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
) {
  return {
    k: nextK,
    x: clientX - rect.left - world.x * nextK,
    y: clientY - rect.top - world.y * nextK,
  };
}

export function pinchDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pinchMidpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function advanceOrbitClock(seconds: number, deltaMs: number, speed: number, freeze: boolean) {
  if (freeze) return 0;
  return seconds + (Math.max(deltaMs, 0) / 1000) * speed;
}

export function isSolarSearching(query: string) {
  return query.trim().length > 0;
}

export function resolveSearchHits(model: SolarModel, query: string) {
  searchResolveStats.calls += 1;
  const hits = new Set<number>();
  const needle = query.trim().toLowerCase();
  if (!needle) return hits;
  for (const body of model.bodies) {
    if (body.kind === "sun") continue;
    if (body.label.toLowerCase().includes(needle) || (body.excerpt ?? "").toLowerCase().includes(needle)) {
      hits.add(body.idx);
    }
  }
  return hits;
}

export function glowSpread(z: number, giant: boolean) {
  if (z < 2.4) return 0;
  return giant ? 2.6 : 2.1;
}

function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function kindLabel(kind: BodyKind) {
  if (kind === "minor") return "minor planet";
  return kind;
}

const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string) {
  const cached = glowSprites.get(color);
  if (cached) return cached;
  const sprite = document.createElement("canvas");
  const size = 64;
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.4, color);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, TAU);
    g.fill();
  }
  glowSprites.set(color, sprite);
  return sprite;
}

function ringDust(body: Body, x: number, y: number, pr: number, k: number, behind: boolean) {
  const dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }> = [];
  const n = body.giant ? 170 : 110;
  const inner = pr * 1.38;
  const outer = pr * 2.28;
  const arm = hashUnit(`${body.id}:ring-arm`) * TAU;
  for (let i = 0; i < n; i++) {
    const u = hashUnit(`${body.id}:ring:${i}`);
    const frac = u;
    if (frac > 0.42 && frac < 0.54) continue;
    const clump = Math.floor(hashUnit(`${body.id}:rc:${i}`) * 4);
    const ang = arm + clump * (TAU / 4) + (hashUnit(`${body.id}:ringa:${i}`) - 0.5) * 0.7;
    const sin = Math.sin(ang);
    if (behind ? sin < 0 : sin >= 0) continue;
    const rad = inner + frac * (outer - inner);
    dots.push({
      x: x + Math.cos(ang) * rad,
      y: y + sin * rad * (0.34 + hashUnit(`${body.id}:ry:${i}`) * 0.22),
      r: (0.32 + u * 0.55) / k,
      color: body.color,
      alpha: 0.3 + u * 0.28,
    });
  }
  return dots;
}

// Each dot gets its own beginPath/arc/fill. Batching same-color dots into one
// Path2D and filling it once (the previous approach) makes the canvas fill
// their UNION as a single flat-alpha shape: overlapping circles read as a
// solid polygon with gaps punched out, not as a soft cluster of dots.
// Filling separately lets overlaps blend (stacked alpha), which is what
// actually reads as a cluster.
export function fillDots(
  ctx: CanvasRenderingContext2D,
  dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }>,
) {
  for (const dot of dots) {
    ctx.fillStyle = dot.color;
    ctx.globalAlpha = dot.alpha;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function mountSolarView(host: HTMLElement, model: SolarModel, options: SolarViewOptions): GraphMount {
  const firstSize = solarStageSize(host, window);
  let width = firstSize.width;
  let height = firstSize.height;
  host.innerHTML = "";
  host.style.height = `${height}px`;
  const onNoteSelect = options.onNoteSelect;
  const freeze = prefersReducedMotion();
  const B = model.bodies;
  const n = B.length;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  const VIS = new Uint8Array(n);
  const maxTag = Math.max(1, ...model.planets.map(planet => planet.count));
  let { fitK, kMin, kMax } = solarScales(model.reach, model.tightest, width, height);
  const view = { k: fitK, x: width / 2, y: height / 2 };
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;

  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas";
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.setAttribute("aria-label", "Universe view. Double-click a body to frame its system.");
  host.appendChild(canvas);

  const tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.hidden = true;
  host.appendChild(tip);

  const narrow = isNarrowViewport(window.innerWidth);
  if (narrow) {
    const zoom = document.createElement("div");
    zoom.className = "universe-zoom";
    zoom.setAttribute("role", "group");
    zoom.setAttribute("aria-label", "Universe zoom");
    zoom.innerHTML = `
      <button class="btn btn--ghost" type="button" data-universe-zoom="in" aria-label="Zoom in">+</button>
      <button class="btn btn--ghost" type="button" data-universe-zoom="out" aria-label="Zoom out">−</button>
    `;
    host.appendChild(zoom);
  }

  const ctx = canvas.getContext("2d")!;
  let hoverIdx = -1;
  let selectedIdx: number | null = null;
  let hot = new Uint8Array(n).fill(1);
  let raf = 0;
  let stopped = false;
  let orbitSeconds = 0;
  let lastFrame = performance.now();
  let lastQuery = options.search;
  let hits = resolveSearchHits(model, lastQuery);
  let lastClickIdx = -1;
  let lastClickAt = 0;

  function recomputeHot() {
    hot = new Uint8Array(n);
    if (selectedIdx == null) {
      hot.fill(1);
      return;
    }
    const selected = B[selectedIdx]!;
    if (selected.pageId) {
      hot[selectedIdx] = 1;
      return;
    }
    hot[selectedIdx] = 1;
    for (let i = selectedIdx + 1; i < n; i++) {
      if (hot[B[i]!.parent]) hot[i] = 1;
    }
  }

  function toWorld(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  }

  function zNow() {
    return view.k / fitK;
  }

  function positionPass(clock: number, band: number, searching: boolean) {
    const pos = worldPositions(B, clock);
    X.set(pos.x);
    Y.set(pos.y);
    for (let i = 0; i < n; i++) {
      const b = B[i]!;
      if (b.parent < 0) {
        VIS[i] = 1;
        continue;
      }
      const p = b.parent;
      if (!VIS[p] || (!searching && KIND_DEPTH[b.kind] > band)) {
        VIS[i] = 0;
        continue;
      }
      const sx = view.x + X[i]! * view.k;
      const sy = view.y + Y[i]! * view.k;
      const m = b.sysR * view.k + 40;
      VIS[i] = sx > -m && sy > -m && sx < width + m && sy < height + m ? 1 : 0;
    }
  }

  function alphaFor(i: number, searching: boolean) {
    if (searching) {
      if (B[i]!.kind === "sun") return 0.35;
      return hits.has(i) ? 1 : 0.2;
    }
    if (selectedIdx != null) return hot[i] ? 1 : 0.22;
    return hoverIdx === i ? 1 : 0.92;
  }

  function findBody(wx: number, wy: number, z: number) {
    let hit = -1;
    let best = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      if (!VIS[i]) continue;
      const body = B[i]!;
      const pr = presence(body, z, view.k, maxTag);
      const dist = Math.hypot(X[i]! - wx, Y[i]! - wy);
      const pad = 6 / view.k;
      if (dist <= pr + pad && dist < best) {
        best = dist;
        hit = i;
      }
    }
    return hit;
  }

  function frameBody(i: number) {
    const body = B[i]!;
    const next = solarZoomClamp((Math.min(width, height) * 0.85) / Math.max(body.sysR * 2, 1e-6), kMin, kMax);
    view.k = next;
    view.x = width / 2 - X[i]! * next;
    view.y = height / 2 - Y[i]! * next;
  }

  function collect(kind: BodyKind, z: number, searching: boolean, band: number) {
    const dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }> = [];
    for (let i = 0; i < n; i++) {
      const body = B[i]!;
      if (body.kind !== kind || !VIS[i]) continue;
      if (!searching && KIND_DEPTH[kind] > band) continue;
      dots.push({
        x: X[i]!,
        y: Y[i]!,
        r: presence(body, z, view.k, maxTag),
        color: body.color,
        alpha: alphaFor(i, searching),
      });
    }
    return dots;
  }

  function draw(now: number) {
    orbitSeconds = advanceOrbitClock(orbitSeconds, now - lastFrame, options.clock?.speed ?? 1, freeze);
    lastFrame = now;
    const z = zNow();
    const band = zoomBand(z);
    const searching = isSolarSearching(options.search);
    positionPass(orbitSeconds, band, searching);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    fillDots(ctx, collect("rock", z, searching, band));
    fillDots(ctx, collect("page", z, searching, band));
    fillDots(ctx, collect("moon", z, searching, band));
    fillDots(ctx, collect("minor", z, searching, band));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i++) {
      const body = B[i]!;
      if (body.kind !== "planet" || !VIS[i]) continue;
      const glow = glowSpread(z, !!body.giant);
      if (glow <= 0) continue;
      const pr = presence(body, z, view.k, maxTag);
      ctx.globalAlpha = alphaFor(i, searching) * (body.giant ? 0.62 : 0.5);
      ctx.drawImage(glowSprite(body.color), X[i]! - pr * glow, Y[i]! - pr * glow, pr * glow * 2, pr * glow * 2);
    }
    ctx.restore();

    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < n; i++) {
      const body = B[i]!;
      if (body.kind !== "planet" || !body.ringed || !VIS[i]) continue;
      fillDots(ctx, ringDust(body, X[i]!, Y[i]!, presence(body, z, view.k, maxTag), view.k, true));
    }
    for (let i = 0; i < n; i++) {
      const body = B[i]!;
      if (body.kind !== "planet" || !VIS[i]) continue;
      const pr = presence(body, z, view.k, maxTag);
      const alpha = alphaFor(i, searching);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = body.color;
      ctx.beginPath();
      ctx.arc(X[i]!, Y[i]!, pr, 0, TAU);
      ctx.fill();
      if (body.giant) {
        ctx.save();
        ctx.translate(X[i]!, Y[i]!);
        ctx.scale(1, 0.42);
        ctx.fillStyle = body.ink;
        ctx.globalAlpha = alpha * 0.28;
        ctx.beginPath();
        ctx.arc(0, -pr * 0.18, pr * 0.92, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, pr * 0.28, pr * 0.78, 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = body.ink;
        ctx.beginPath();
        ctx.arc(X[i]! + pr * 0.32, Y[i]! - pr * 0.12, pr * 0.2, 0, TAU);
        ctx.fill();
      }
    }
    for (let i = 0; i < n; i++) {
      const body = B[i]!;
      if (body.kind !== "planet" || !body.ringed || !VIS[i]) continue;
      fillDots(ctx, ringDust(body, X[i]!, Y[i]!, presence(body, z, view.k, maxTag), view.k, false));
    }

    const sun = model.sun;
    if (VIS[sun.idx]) {
      const pr = presence(sun, z, view.k, maxTag);
      ctx.globalAlpha = alphaFor(sun.idx, searching);
      ctx.drawImage(glowSprite(sun.color), X[sun.idx]! - pr * 1.8, Y[sun.idx]! - pr * 1.8, pr * 3.6, pr * 3.6);
      ctx.fillStyle = sun.color;
      ctx.beginPath();
      ctx.arc(X[sun.idx]!, Y[sun.idx]!, pr, 0, TAU);
      ctx.fill();
    }

    if (searching && hits.size) {
      const pins: Array<{ x: number; y: number; r: number; color: string; alpha: number }> = [];
      for (const i of hits) {
        if (!VIS[i]) continue;
        const body = B[i]!;
        pins.push({
          x: X[i]!,
          y: Y[i]!,
          r: Math.max(presence(body, z, view.k, maxTag), 3.2 / view.k),
          color: body.color,
          alpha: 1,
        });
      }
      fillDots(ctx, pins);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function loop(now: number) {
    if (stopped) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const world = toWorld(clientX, clientY);
    const next = solarZoomClamp(view.k * factor, kMin, kMax);
    const rect = canvas.getBoundingClientRect();
    Object.assign(view, cameraFromWorld(world, next, clientX, clientY, rect));
  }

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.08 : 0.92);
    },
    { passive: false },
  );

  host.querySelectorAll<HTMLButtonElement>("[data-universe-zoom]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, button.dataset.universeZoom === "in" ? 1.18 : 0.85);
    });
  });

  const pointers = new Map<number, { x: number; y: number }>();
  let gestureOrigin = { x: 0, y: 0 };
  let gestureStart = { x: 0, y: 0 };
  let gesturePointerId = 1;
  let panned = false;
  let pinch:
    | {
        dist: number;
        k: number;
        world: { x: number; y: number };
      }
    | null = null;

  function pointerIdOf(event: PointerEvent) {
    return event.pointerId ?? 1;
  }

  function beginPinch() {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const mid = pinchMidpoint(a, b);
    pinch = { dist: pinchDistance(a, b), k: view.k, world: toWorld(mid.x, mid.y) };
    panned = true;
  }

  function applyPinch() {
    if (!pinch || pointers.size < 2 || pinch.dist < 1) return;
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const mid = pinchMidpoint(a, b);
    const next = solarZoomClamp(pinch.k * (pinchDistance(a, b) / pinch.dist), kMin, kMax);
    const rect = canvas.getBoundingClientRect();
    Object.assign(view, cameraFromWorld(pinch.world, next, mid.x, mid.y, rect));
  }

  function selectAt(clientX: number, clientY: number) {
    const world = toWorld(clientX, clientY);
    const z = zNow();
    const i = findBody(world.x, world.y, z);
    if (i < 0) {
      selectedIdx = null;
      recomputeHot();
      onNoteSelect(null);
      return;
    }
    const now = performance.now();
    const doubled = lastClickIdx === i && now - lastClickAt < 400;
    lastClickIdx = i;
    lastClickAt = now;
    if (doubled) frameBody(i);
    const body = B[i]!;
    selectedIdx = i;
    recomputeHot();
    if (body.pageId) {
      onNoteSelect({ pageId: body.pageId, title: body.label, excerpt: body.excerpt ?? "" });
    } else {
      onNoteSelect(null);
    }
  }

  const onGestureMove = (move: PointerEvent) => {
    const id = pointerIdOf(move);
    if (!pointers.has(id)) return;
    pointers.set(id, { x: move.clientX, y: move.clientY });
    if (pointers.size >= 2) {
      if (!pinch) beginPinch();
      applyPinch();
      return;
    }
    if (id !== gesturePointerId) return;
    if (Math.hypot(move.clientX - gestureStart.x, move.clientY - gestureStart.y) < 4 && !panned) return;
    panned = true;
    view.x = gestureOrigin.x + (move.clientX - gestureStart.x);
    view.y = gestureOrigin.y + (move.clientY - gestureStart.y);
  };

  const onGestureUp = (up: PointerEvent) => {
    const id = pointerIdOf(up);
    if (!pointers.has(id)) return;
    pointers.delete(id);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    window.removeEventListener("pointermove", onGestureMove);
    window.removeEventListener("pointerup", onGestureUp);
    if (panned) return;
    selectAt(up.clientX, up.clientY);
  };

  canvas.addEventListener("pointerdown", event => {
    const id = pointerIdOf(event);
    if (pointers.size === 0) {
      panned = false;
      pinch = null;
      gesturePointerId = id;
      gestureStart = { x: event.clientX, y: event.clientY };
      gestureOrigin = { ...view };
      window.addEventListener("pointermove", onGestureMove);
      window.addEventListener("pointerup", onGestureUp);
    }
    pointers.set(id, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) beginPinch();
  });

  canvas.addEventListener("pointermove", event => {
    const world = toWorld(event.clientX, event.clientY);
    const i = findBody(world.x, world.y, zNow());
    hoverIdx = i;
    canvas.style.cursor = i >= 0 ? "pointer" : "grab";
    if (i >= 0) {
      const body = B[i]!;
      tip.hidden = false;
      tip.textContent = `${body.label} · ${kindLabel(body.kind)} · ${body.count}`;
      const hostRect = host.getBoundingClientRect();
      tip.style.left = `${event.clientX - hostRect.left + 12}px`;
      tip.style.top = `${event.clientY - hostRect.top + 12}px`;
    } else {
      tip.hidden = true;
    }
  });

  canvas.addEventListener("pointerleave", () => {
    hoverIdx = -1;
    tip.hidden = true;
  });

  function applyHostSize() {
    const next = applySolarStageResize(
      { width, height, fitK, kMin, kMax, k: view.k, x: view.x, y: view.y },
      { width: host.clientWidth, height: host.clientHeight },
      model.reach,
      model.tightest,
    );
    if (next.width === width && next.height === height) return;
    width = next.width;
    height = next.height;
    fitK = next.fitK;
    kMin = next.kMin;
    kMax = next.kMax;
    view.k = next.k;
    view.x = next.x;
    view.y = next.y;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          applyHostSize();
        })
      : null;
  resizeObserver?.observe(host);

  raf = requestAnimationFrame(loop);

  return attachGraphSearch(
    () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      host.innerHTML = "";
    },
    query => {
      options.search = query;
      if (query === lastQuery) return;
      lastQuery = query;
      hits = resolveSearchHits(model, query);
    },
  );
}
