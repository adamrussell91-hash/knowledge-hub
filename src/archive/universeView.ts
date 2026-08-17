import type { UniverseBody, UniverseBodyKind, UniverseGraphModel } from "./universeGraph";
import { attachGraphSearch, type GraphMount } from "./forceGraphBehavior";

export type UniverseNotePayload = { pageId: string; title: string; excerpt: string };

export type UniverseViewOptions = {
  search: string;
  onNoteSelect: (note: UniverseNotePayload | null) => void;
  clock?: { speed: number };
};

type Placed = UniverseBody & { x: number; y: number };

const KIND_ORDER: UniverseBodyKind[] = ["sun", "planet", "asteroid", "minorPlanet", "moon", "moonet", "note"];
const ENTER_MS = 800;
const K_START = 0.0045;
const K_END = 0.007;
const NOTE_DRAW_LIMIT = 1500;
const PULSE_HZ = 0.6;
const PULSE_AMP = 0.06;
const PULSE_BUMP_AMP = 0.18;
const PULSE_BUMP_MS = 1200;

export function positionAt(
  body: UniverseBody,
  byId: Map<string, UniverseBody & { x: number; y: number }>,
  timeSec: number,
  freeze: boolean,
) {
  if (!body.parentId) return { x: 0, y: 0 };
  const parent = byId.get(body.parentId);
  const origin = parent ?? { x: 0, y: 0 };
  const angle = body.phase + (freeze || body.periodSec === 0 ? 0 : (timeSec / body.periodSec) * Math.PI * 2);
  return {
    x: origin.x + Math.cos(angle) * body.orbitRadius,
    y: origin.y + Math.sin(angle) * body.orbitRadius,
  };
}

/** Scale each frame's own slice of time, so moving the speed slider changes pace without jumping the orbits. */
export function advanceOrbitClock(seconds: number, deltaMs: number, speed: number, freeze: boolean) {
  if (freeze) return 0;
  return seconds + (Math.max(deltaMs, 0) / 1000) * speed;
}

export function isUniverseSearching(query: string) {
  return query.trim().length > 0;
}

export function universeHotIds(bodies: UniverseBody[], query: string) {
  const hot = new Set<string>();
  if (!isUniverseSearching(query)) return hot;
  const needle = query.trim().toLowerCase();
  for (const body of bodies) {
    if (body.kind === "sun") continue;
    if (body.label.toLowerCase().includes(needle)) hot.add(body.id);
  }
  const pageIds = new Set(bodies.filter(body => hot.has(body.id) && body.pageId).map(body => body.pageId!));
  for (const body of bodies) {
    if (body.pageId && pageIds.has(body.pageId)) hot.add(body.id);
  }
  return hot;
}

export function universeSubtreeIds(bodies: UniverseBody[], selectedId: string | null) {
  const ids = new Set<string>();
  if (!selectedId) return ids;
  ids.add(selectedId);
  let added = true;
  while (added) {
    added = false;
    for (const body of bodies) {
      if (body.parentId && ids.has(body.parentId) && !ids.has(body.id)) {
        ids.add(body.id);
        added = true;
      }
    }
  }
  return ids;
}

export function isUniverseHot(body: UniverseBody, selectedId: string | null, bodies: UniverseBody[]) {
  if (!selectedId) return true;
  const selected = bodies.find(item => item.id === selectedId);
  if (selected?.pageId) {
    return Boolean(body.pageId && body.pageId === selected.pageId);
  }
  return universeSubtreeIds(bodies, selectedId).has(body.id);
}

export function notesToKeep(
  notes: Array<{ id: string; x: number; y: number }>,
  centre: { x: number; y: number },
  hotIds: Set<string>,
  limit = NOTE_DRAW_LIMIT,
) {
  if (notes.length <= limit) return new Set(notes.map(note => note.id));
  const ranked = notes
    .map(note => ({ id: note.id, d: Math.hypot(note.x - centre.x, note.y - centre.y) }))
    .sort((a, b) => a.d - b.d);
  const kept = new Set(ranked.slice(0, limit).map(note => note.id));
  for (const id of hotIds) kept.add(id);
  return kept;
}

function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sunRadius(body: UniverseBody, timeSec: number, freeze: boolean, bump: boolean) {
  if (freeze) return body.r;
  const amp = bump ? PULSE_BUMP_AMP : PULSE_AMP;
  return body.r * (1 + amp * Math.sin(timeSec * Math.PI * 2 * PULSE_HZ));
}

const MIN_SCREEN_R: Record<UniverseBodyKind, number> = {
  sun: 15,
  planet: 6,
  asteroid: 1.4,
  minorPlanet: 4,
  moon: 3.2,
  moonet: 2.4,
  note: 1.8,
};

export function visualRadius(kind: UniverseBodyKind, worldR: number, k: number) {
  return Math.max(worldR, MIN_SCREEN_R[kind] / k);
}

function truncate(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function mountUniverseView(host: HTMLElement, model: UniverseGraphModel, options: UniverseViewOptions): GraphMount {
  const width = host.clientWidth || 1100;
  const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
  host.innerHTML = "";
  host.style.height = `${height}px`;
  const onNoteSelect = options.onNoteSelect;
  const freeze = prefersReducedMotion();
  const start = performance.now();

  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas";
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.appendChild(canvas);

  const tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.hidden = true;
  host.appendChild(tip);

  const ctx = canvas.getContext("2d")!;
  const view = { k: freeze ? K_END : K_START, x: width / 2, y: height / 2 };
  let userCamera = false;
  let hover: Placed | null = null;
  let selectedId: string | null = null;
  let bumpUntil = 0;
  let raf = 0;
  let stopped = false;
  let lastPlaced: Placed[] = [];
  let orbitSeconds = 0;
  let lastFrame = start;
  let lastSunR = model.bodies.find(body => body.kind === "sun")?.r ?? 18;
  const live = model.bodies.map(body => ({ ...body, x: 0, y: 0 }));
  const liveById = new Map(live.map(body => [body.id, body]));
  const liveByKind = KIND_ORDER.map(kind => live.filter(body => body.kind === kind));

  function onScreen(x: number, y: number, pad = 64) {
    const sx = view.x + x * view.k;
    const sy = view.y + y * view.k;
    return sx >= -pad && sy >= -pad && sx <= width + pad && sy <= height + pad;
  }

  function layoutLive(timeSec: number) {
    for (const group of liveByKind) {
      for (const body of group) {
        if (body.kind === "note" || body.kind === "asteroid") {
          const parent = body.parentId ? liveById.get(body.parentId) : null;
          if (parent && !onScreen(parent.x, parent.y, 120)) {
            body.x = parent.x;
            body.y = parent.y;
            continue;
          }
        }
        const pos = positionAt(body, liveById, timeSec, freeze);
        body.x = pos.x;
        body.y = pos.y;
      }
    }
    return live;
  }

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  };

  function findBody(x: number, y: number) {
    let hit: Placed | null = null;
    let best = Infinity;
    const skipNotes = view.k < 0.05;
    for (let i = lastPlaced.length - 1; i >= 0; i--) {
      const body = lastPlaced[i];
      if (skipNotes && body.kind === "note") continue;
      const r = visualRadius(body.kind, body.kind === "sun" ? lastSunR : body.r, view.k);
      const pad = (body.kind === "note" || body.kind === "asteroid" ? 4 : body.kind === "moonet" ? 5 : body.kind === "moon" ? 6 : 8) / view.k;
      const dist = Math.hypot(body.x - x, body.y - y);
      if (dist <= r + pad && dist < best) {
        best = dist;
        hit = body;
      }
    }
    return hit;
  }

  function bodyAlpha(body: Placed, hotIds: Set<string>, searching: boolean) {
    if (searching) {
      if (body.kind === "sun") return 0.35;
      return hotIds.has(body.id) ? 1 : 0.2;
    }
    if (selectedId) return isUniverseHot(body, selectedId, model.bodies) ? 1 : 0.22;
    return hover?.id === body.id ? 1 : 0.92;
  }

  function draw(now: number) {
    orbitSeconds = advanceOrbitClock(orbitSeconds, now - lastFrame, options.clock?.speed ?? 1, freeze);
    lastFrame = now;
    const timeSec = orbitSeconds;
    if (!freeze && !userCamera) {
      const t = easeOutCubic((now - start) / ENTER_MS);
      view.k = K_START + (K_END - K_START) * t;
      view.x = width / 2;
      view.y = height / 2;
    }

    const placed = layoutLive(timeSec);
    const bump = now < bumpUntil;
    const sun = placed.find(body => body.kind === "sun");
    const sunR = sun ? visualRadius("sun", sunRadius(sun, timeSec, freeze, bump), view.k) : 18;
    lastPlaced = placed;
    lastSunR = sunR;

    const searching = isUniverseSearching(options.search);
    const hotIds = universeHotIds(model.bodies, options.search);
    const centre = { x: (width / 2 - view.x) / view.k, y: (height / 2 - view.y) / view.k };
    const notes = placed.filter(
      body =>
        (body.kind === "note" || body.kind === "asteroid") &&
        (hotIds.has(body.id) || onScreen(body.x, body.y)),
    );
    const keepNotes = notesToKeep(notes, centre, hotIds);

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    for (const body of placed) {
      if ((body.kind !== "note" && body.kind !== "asteroid") || !keepNotes.has(body.id)) continue;
      const alpha = bodyAlpha(body, hotIds, searching);
      const drawR = visualRadius(body.kind, body.r, view.k);
      ctx.beginPath();
      ctx.arc(body.x, body.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = body.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (hover?.id === body.id || view.k > 1.1) {
        ctx.fillStyle = body.ink;
        ctx.globalAlpha = alpha;
        ctx.font = `500 ${11 / view.k}px Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(truncate(body.label, 32), body.x + drawR + 6 / view.k, body.y);
        ctx.globalAlpha = 1;
      }
    }

    for (const kind of ["moonet", "moon", "minorPlanet"] as const) {
      for (const body of placed) {
        if (body.kind !== kind) continue;
        if (!onScreen(body.x, body.y, 120)) continue;
        const alpha = bodyAlpha(body, hotIds, searching);
        const drawR = visualRadius(kind, body.r, view.k);
        ctx.beginPath();
        ctx.arc(body.x, body.y, drawR, 0, Math.PI * 2);
        ctx.fillStyle = body.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.1 / view.k;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        if (hover?.id === body.id && body.label) {
          ctx.fillStyle = body.ink;
          ctx.globalAlpha = alpha;
          ctx.font = `600 ${12 / view.k}px Inter, ui-sans-serif, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(truncate(body.label, 26), body.x + drawR + 7 / view.k, body.y);
          ctx.globalAlpha = 1;
        }
      }
    }

    for (const body of placed) {
      if (body.kind !== "planet") continue;
      if (!onScreen(body.x, body.y, 160)) continue;
      const alpha = bodyAlpha(body, hotIds, searching);
      const drawR = visualRadius("planet", body.r, view.k);
      ctx.beginPath();
      ctx.arc(body.x, body.y, drawR, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(
        body.x - drawR * 0.3,
        body.y - drawR * 0.3,
        2,
        body.x,
        body.y,
        drawR,
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.45, body.soft);
      gradient.addColorStop(1, body.color);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = (hover?.id === body.id ? 2.6 : 1.4) / view.k;
      ctx.strokeStyle = hover?.id === body.id ? "#e07a2f" : "#fff";
      ctx.stroke();
      if (hover?.id === body.id) {
        ctx.fillStyle = body.ink;
        ctx.globalAlpha = alpha;
        ctx.font = `600 ${14 / view.k}px Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(body.label, body.x, body.y + drawR + 8 / view.k);
        ctx.globalAlpha = 1;
      }
    }

    if (sun) {
      const alpha = bodyAlpha(sun, hotIds, searching);
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, sunR * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = sun.soft;
      ctx.globalAlpha = alpha * 0.55;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, sunR, 0, Math.PI * 2);
      const glow = ctx.createRadialGradient(sun.x - sunR * 0.35, sun.y - sunR * 0.35, 2, sun.x, sun.y, sunR);
      glow.addColorStop(0, "#fff6d8");
      glow.addColorStop(0.45, sun.color);
      glow.addColorStop(1, "#e07a2f");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.6 / view.k;
      ctx.strokeStyle = sun.ink;
      ctx.stroke();
    }

    ctx.restore();
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
      userCamera = true;
      const world = toWorld(event.clientX, event.clientY);
      const next = Math.min(2.4, Math.max(0.02, view.k * (event.deltaY < 0 ? 1.08 : 0.92)));
      const rect = canvas.getBoundingClientRect();
      view.x = event.clientX - rect.left - world.x * next;
      view.y = event.clientY - rect.top - world.y * next;
      view.k = next;
    },
    { passive: false },
  );

  canvas.addEventListener("pointerdown", event => {
    const world = toWorld(event.clientX, event.clientY);
    const body = findBody(world.x, world.y);
    if (body) {
      canvas.setPointerCapture?.(event.pointerId);
      const onUp = (up: PointerEvent) => {
        canvas.removeEventListener("pointerup", onUp);
        const still = findBody(toWorld(up.clientX, up.clientY).x, toWorld(up.clientX, up.clientY).y);
        if (!(still && still.id === body.id)) return;
        if ((body.kind === "note" || body.kind === "asteroid") && body.pageId) {
          selectedId = body.id;
          onNoteSelect({ pageId: body.pageId, title: body.label, excerpt: body.excerpt ?? "" });
          return;
        }
        if (body.kind === "planet" || body.kind === "minorPlanet" || body.kind === "moon" || body.kind === "moonet") {
          selectedId = body.id;
          onNoteSelect(null);
          return;
        }
        if (body.kind === "sun") {
          bumpUntil = performance.now() + PULSE_BUMP_MS;
        }
      };
      canvas.addEventListener("pointerup", onUp);
      return;
    }

    userCamera = true;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...view };
    const onMove = (move: PointerEvent) => {
      view.x = origin.x + (move.clientX - startX);
      view.y = origin.y + (move.clientY - startY);
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (Math.hypot(up.clientX - startX, up.clientY - startY) < 4) {
        selectedId = null;
        onNoteSelect(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  canvas.addEventListener("pointermove", event => {
    const world = toWorld(event.clientX, event.clientY);
    const body = findBody(world.x, world.y);
    hover = body;
    canvas.style.cursor = body ? "pointer" : "grab";
    if (body) {
      tip.hidden = false;
      tip.textContent =
        body.kind === "sun" || body.kind === "note" || body.kind === "asteroid"
          ? body.label
          : body.label
            ? `${body.label} · ${body.count}`
            : `${body.count} notes`;
      tip.style.left = `${event.clientX - host.getBoundingClientRect().left + 12}px`;
      tip.style.top = `${event.clientY - host.getBoundingClientRect().top + 12}px`;
    } else {
      tip.hidden = true;
    }
  });

  canvas.addEventListener("pointerleave", () => {
    hover = null;
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
    },
  );
}
