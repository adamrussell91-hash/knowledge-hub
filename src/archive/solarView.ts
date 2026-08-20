import { attachGraphSearch, type GraphMount } from "./forceGraphBehavior";
import { hashUnit, worldPositions, type Body, type BodyKind, type SolarModel } from "./solarModel";

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
  page: 2,
};

export const searchResolveStats = { calls: 0 };

const TAU = Math.PI * 2;
const HALO = "#fbf8f2";
const LABEL_BG = HALO;

export function zoomBand(z: number) {
  if (z < 2.4) return 0;
  if (z < 9) return 1;
  if (z < 45) return 2;
  return 3;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function presence(body: Body, z: number, k: number, maxTag: number) {
  const safeK = Math.max(k, 1e-9);
  const tag = Math.max(maxTag, 1);
  let t: number;
  let big: number;
  if (body.kind === "planet") {
    t = clamp01((z - 2.4) / 7);
    big = (9 + Math.sqrt(body.count / tag) * 15) / safeK;
    if (body.giant) big *= 1.4;
  } else if (body.kind === "minor") {
    t = clamp01((z - 2.4) / 12);
    big = (4.2 + Math.sqrt(body.count / tag) * 6) / safeK;
  } else if (body.kind === "moon") {
    t = clamp01((z - 9) / 80);
    big = Math.max(body.r, 2.1 / safeK);
  } else {
    return Math.max(body.r, 1.4 / safeK);
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

function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function kindLabel(kind: BodyKind) {
  if (kind === "minor") return "minor planet";
  return kind;
}

type Rect = { x: number; y: number; w: number; h: number };

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
  for (let i = 0; i < n; i++) {
    const u = hashUnit(`${body.id}:ring:${i}`);
    const frac = u;
    if (frac > 0.42 && frac < 0.54) continue;
    const rad = inner + frac * (outer - inner);
    const ang = hashUnit(`${body.id}:ringa:${i}`) * TAU;
    const sin = Math.sin(ang);
    if (behind ? sin < 0 : sin >= 0) continue;
    dots.push({
      x: x + Math.cos(ang) * rad,
      y: y + sin * rad * 0.22,
      r: (0.32 + u * 0.55) / k,
      color: body.color,
      alpha: 0.3 + u * 0.28,
    });
  }
  return dots;
}

function starDust(view: { k: number; x: number; y: number }, width: number, height: number) {
  const dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }> = [];
  const cell = 150;
  const left = -view.x / view.k - cell;
  const top = -view.y / view.k - cell;
  const right = (width - view.x) / view.k + cell;
  const bottom = (height - view.y) / view.k + cell;
  const ix0 = Math.floor(left / cell);
  const iy0 = Math.floor(top / cell);
  const ix1 = Math.ceil(right / cell);
  const iy1 = Math.ceil(bottom / cell);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const u = hashUnit(`star:${ix}:${iy}`);
      if (u > 0.13) continue;
      dots.push({
        x: (ix + hashUnit(`starx:${ix}:${iy}`)) * cell,
        y: (iy + hashUnit(`stary:${ix}:${iy}`)) * cell,
        r: ((0.45 + u * 1.4) * 0.85) / view.k,
        color: "#315875",
        alpha: 0.18 + u * 0.32,
      });
    }
  }
  return dots;
}

function fillDots(
  ctx: CanvasRenderingContext2D,
  dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }>,
) {
  if (!dots.length) return;
  const groups = new Map<string, typeof dots>();
  for (const dot of dots) {
    const key = `${dot.color}|${dot.alpha.toFixed(3)}`;
    const list = groups.get(key) ?? [];
    list.push(dot);
    groups.set(key, list);
  }
  const usePath = typeof Path2D === "function";
  for (const group of groups.values()) {
    const first = group[0]!;
    ctx.fillStyle = first.color;
    ctx.globalAlpha = first.alpha;
    if (usePath) {
      const path = new Path2D();
      for (const dot of group) path.arc(dot.x, dot.y, dot.r, 0, TAU);
      ctx.fill(path);
    } else {
      for (const dot of group) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

export function mountSolarView(host: HTMLElement, model: SolarModel, options: SolarViewOptions): GraphMount {
  const width = host.clientWidth || 1100;
  const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
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
  const { fitK, kMin, kMax } = solarScales(model.reach, model.tightest, width, height);
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

  function drawLabels(z: number, band: number) {
    const occupied: Rect[] = [];
    const drawOne = (i: number, font: string) => {
      const body = B[i]!;
      const sx = view.x + X[i]! * view.k;
      const sy = view.y + Y[i]! * view.k;
      const pr = presence(body, z, view.k, maxTag) * view.k;
      const tx = sx + pr + 6;
      const ty = sy;
      ctx.font = font;
      const w = ctx.measureText(body.label).width + 8;
      const h = 16;
      const rect = { x: tx, y: ty - h / 2, w, h };
      if (tx < -20 || ty < -20 || tx > width + 20 || ty > height + 20) return;
      if (occupied.some(item => overlaps(item, rect))) return;
      occupied.push(rect);
      ctx.lineJoin = "round";
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = LABEL_BG;
      ctx.fillStyle = body.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.strokeText(body.label, tx, ty);
      ctx.fillText(body.label, tx, ty);
    };

    for (let i = 0; i < n; i++) {
      if (!VIS[i] || B[i]!.kind !== "planet") continue;
      drawOne(i, "600 13px Inter, ui-sans-serif, sans-serif");
    }
    if (band >= 1) {
      for (let i = 0; i < n; i++) {
        if (!VIS[i] || B[i]!.kind !== "minor") continue;
        drawOne(i, "600 12px Inter, ui-sans-serif, sans-serif");
      }
    }
    if (z > 30) {
      const moons = [];
      for (let i = 0; i < n; i++) {
        const body = B[i]!;
        if (!VIS[i] || body.kind !== "moon" || body.count < 3) continue;
        moons.push(body);
      }
      moons.sort((a, b) => b.count - a.count);
      for (const moon of moons.slice(0, 16)) {
        drawOne(moon.idx, "600 11px Inter, ui-sans-serif, sans-serif");
      }
    }
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

    fillDots(ctx, starDust(view, width, height));
    fillDots(ctx, collect("rock", z, searching, band));
    fillDots(ctx, collect("page", z, searching, band));
    fillDots(ctx, collect("moon", z, searching, band));
    fillDots(ctx, collect("minor", z, searching, band));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i++) {
      const body = B[i]!;
      if (body.kind !== "planet" || !VIS[i]) continue;
      const pr = presence(body, z, view.k, maxTag);
      ctx.globalAlpha = alphaFor(i, searching) * (body.giant ? 0.62 : 0.5);
      const glow = body.giant ? 2.6 : 2.1;
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
    drawLabels(z, band);
  }

  function loop(now: number) {
    if (stopped) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const world = toWorld(event.clientX, event.clientY);
      const next = solarZoomClamp(view.k * (event.deltaY < 0 ? 1.08 : 0.92), kMin, kMax);
      const rect = canvas.getBoundingClientRect();
      view.x = event.clientX - rect.left - world.x * next;
      view.y = event.clientY - rect.top - world.y * next;
      view.k = next;
    },
    { passive: false },
  );

  canvas.addEventListener("pointerdown", event => {
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...view };
    let panned = false;
    const onMove = (move: PointerEvent) => {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) < 4 && !panned) return;
      panned = true;
      view.x = origin.x + (move.clientX - startX);
      view.y = origin.y + (move.clientY - startY);
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (panned) return;
      const world = toWorld(up.clientX, up.clientY);
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
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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

  raf = requestAnimationFrame(loop);

  return attachGraphSearch(
    () => {
      stopped = true;
      cancelAnimationFrame(raf);
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
