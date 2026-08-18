import type { PageManifestEntry } from "../domain/page";
import { buildArchiveGraph, topicKeywords } from "./keywordGraph";

export type UniverseBodyKind = "sun" | "planet" | "asteroid" | "minorPlanet" | "moon" | "moonet" | "note";

export type UniverseBody = {
  id: string;
  kind: UniverseBodyKind;
  label: string;
  parentId: string | null;
  pageId?: string;
  excerpt?: string;
  count: number;
  color: string;
  soft: string;
  ink: string;
  r: number;
  orbitRadius: number;
  periodSec: number;
  phase: number;
};

export type UniverseGraphModel = {
  bodies: UniverseBody[];
};

export const NOTE_RINGS = 10;
const NOTE_INNER_SHARE = 0.18;
/** Each planet takes half the gap, so neighbouring outer note rings meet. */
const CLUSTER_FILL = 0.5;

export const SUN_RADIUS = 46;
/** No body may ever come this close to the centre, so nothing crosses the sun or its corona. */
export const SUN_KEEP_OUT = SUN_RADIUS * 4;
export const INNER_PLANET_SLOTS = 4;
export const MIN_PLANET_RINGS = 6;
export const PLANET_INNER = 60000;
export const PLANET_GAP = 2000;
/** World units between consecutive note rings around a planet. */
export const NOTE_RING_GAP = 5500;
export const BELT_RINGS = 6;

const LEVEL_SHARE = { minorPlanet: 0.55, note: 0.4 };
const NOTE_RADIUS = 4.4;

type ClusterBudget = { outer: number; minorPlanet: number; note: number };

/** A cluster may not reach the sun, nor stretch into the neighbouring planet's or belt's orbit. */
export function clusterBudget(orbitRadius: number, prevFence: number, nextFence: number): ClusterBudget {
  const room = Math.min(orbitRadius - prevFence, nextFence - orbitRadius) * CLUSTER_FILL;
  const budget = Math.max(40, Math.min(orbitRadius - SUN_KEEP_OUT, room));
  return {
    outer: budget,
    minorPlanet: budget * LEVEL_SHARE.minorPlanet,
    note: budget * LEVEL_SHARE.note,
  };
}

export function pickAsteroidBelt(majors: Array<{ label: string; count: number }>) {
  const named =
    majors.find(major => /cognitive psychology/i.test(major.label)) ??
    majors.find(major => /educational psychology/i.test(major.label));
  if (named) return named.label;
  if (majors.length < 2) return null;
  const ranked = [...majors].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (ranked[0]!.count >= ranked[1]!.count * 2) return ranked[0]!.label;
  return null;
}

/** Scattered around the clock — not a line of phase 0, and not a radius-locked spiral. */
export function solarPhase(index: number) {
  const turn = (index * (Math.sqrt(5) - 1)) / 2;
  return (turn % 1) * Math.PI * 2;
}

export function solarSystemLayout(
  planetMajors: Array<{ label: string; count: number }>,
  hasBelt: boolean,
) {
  const inner = [...planetMajors]
    .sort((a, b) => a.count - b.count || a.label.localeCompare(b.label))
    .slice(0, INNER_PLANET_SLOTS);
  const innerLabels = new Set(inner.map(major => major.label));
  const outer = planetMajors.filter(major => !innerLabels.has(major.label));
  const planetRadii = new Map<string, number>();
  inner.forEach((major, index) => {
    planetRadii.set(major.label, PLANET_INNER + index * PLANET_GAP);
  });
  const afterInner = PLANET_INNER + Math.max(inner.length - 1, 0) * PLANET_GAP;
  const beltInner = hasBelt ? afterInner + PLANET_GAP : afterInner;
  const beltOuter = hasBelt ? beltInner + PLANET_GAP : beltInner;
  const outerStart = (hasBelt ? beltOuter : afterInner) + PLANET_GAP;
  outer.forEach((major, index) => {
    planetRadii.set(major.label, outerStart + index * PLANET_GAP);
  });
  return { planetRadii, beltInner, beltOuter, inner, outer };
}

export function beltOrbitSlots(count: number, inner: number, outer: number, rings = BELT_RINGS) {
  if (count <= 0) return [];
  const nRings = Math.max(rings, 1);
  const gap = nRings === 1 ? 0 : (outer - inner) / (nRings - 1);
  const radii = Array.from({ length: nRings }, (_, i) => inner + i * gap);
  const base = Math.floor(count / nRings);
  const extra = count % nRings;
  const out: { radius: number; phase: number }[] = [];
  radii.forEach((radius, ring) => {
    const n = base + (ring < extra ? 1 : 0);
    if (!n) return;
    const offset = (ring % 2) * (Math.PI / n);
    for (let i = 0; i < n; i++) out.push({ radius, phase: evenPhase(i, n) + offset });
  });
  return out;
}

/** Stronger co-occurrence sorts a minor planet earlier around its shared orbit. */
export function minorOrbitOrder(weight: number, maxWeight: number) {
  return maxWeight <= 0 ? 1 : 1 - weight / maxWeight;
}

function periodFor(radius: number, base: number, scale: number) {
  return base + radius * scale;
}

const SPEED_JITTER = 0.1;

function hashUnit(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/** Each body keeps its own speed within ±10%, derived from its id so it never changes between loads. */
export function orbitSpeedJitter(id: string) {
  return 1 + (hashUnit(id) * 2 - 1) * SPEED_JITTER;
}

function applySpeedJitter(bodies: UniverseBody[]) {
  for (const body of bodies) {
    if (body.periodSec === 0) continue;
    if (body.kind === "planet") continue;
    body.periodSec /= orbitSpeedJitter(body.id);
  }
  return bodies;
}

export function evenPhase(index: number, count: number) {
  return (Math.PI * 2 * index) / Math.max(count, 1);
}

const SOLO_CIRCLE_SHARE = 0.8;
const INNER_CIRCLE_SHARE = 0.45;
const MAX_CIRCLES = 14;

function circleCapacity(radius: number, spacing: number) {
  return Math.max(4, Math.floor((Math.PI * 2 * radius) / spacing));
}

function circleRadii(circles: number, maxRadius: number) {
  if (circles <= 1) return [maxRadius * SOLO_CIRCLE_SHARE];
  const span = SOLO_CIRCLE_SHARE - INNER_CIRCLE_SHARE;
  return Array.from(
    { length: circles },
    (_, i) => maxRadius * (INNER_CIRCLE_SHARE + (span * i) / (circles - 1)),
  );
}

/**
 * Siblings share full circles: one circle holds them all unless they would touch, and only then
 * does a second evenly filled circle open. A body never gets a radius of its own, which is what
 * turns an even spread of angles into a spiral arm.
 */
export function evenOrbitSlots(
  count: number,
  maxRadius: number,
  bodyRadius: number,
): { radius: number; phase: number }[] {
  if (count <= 0) return [];
  const spacing = Math.max(bodyRadius * 3.2, 7);
  let radii = circleRadii(1, maxRadius);
  for (let circles = 1; circles <= MAX_CIRCLES; circles++) {
    radii = circleRadii(circles, maxRadius);
    const room = radii.reduce((sum, radius) => sum + circleCapacity(radius, spacing), 0);
    if (room >= count) break;
  }
  const base = Math.floor(count / radii.length);
  const extra = count % radii.length;
  const out: { radius: number; phase: number }[] = [];
  radii.forEach((radius, circle) => {
    const n = base + (circle < extra ? 1 : 0);
    if (!n) return;
    // Half-step neighbouring circles so their bodies interleave instead of lining up on a spoke.
    const offset = (circle % 2) * (Math.PI / n);
    for (let i = 0; i < n; i++) out.push({ radius, phase: evenPhase(i, n) + offset });
  });
  return out;
}

type DraftNote = UniverseBody & { share: number };

function stretchedRingSpan(hostR: number) {
  const inner = Math.max(hostR * 3, NOTE_RING_GAP);
  const outer = inner + (NOTE_RINGS - 1) * NOTE_RING_GAP;
  return { inner, outer };
}

function noteRingSpan(outer: number, hostR: number) {
  const stretched = stretchedRingSpan(hostR);
  const rim = Math.max(outer, hostR * 4);
  if (rim >= stretched.outer) return stretched;
  const inner = Math.max(hostR * 3, Math.min(stretched.inner, rim * NOTE_INNER_SHARE));
  return { inner: Math.min(inner, rim * 0.85), outer: rim };
}

function placeNotesOnRings(parent: UniverseBody, notes: DraftNote[], outer: number) {
  const { inner, outer: rim } = noteRingSpan(Math.max(outer, parent.r * 4), parent.r);
  const slots = beltOrbitSlots(notes.length, inner, rim, NOTE_RINGS);
  notes.forEach((note, index) => {
    const slot = slots[index] ?? { radius: rim, phase: evenPhase(index, notes.length) };
    note.parentId = parent.id;
    note.color = parent.color;
    note.soft = parent.soft;
    note.ink = parent.ink;
    note.orbitRadius = slot.radius;
    note.periodSec = periodFor(slot.radius, 6, 0.05);
    note.phase = slot.phase;
  });
}

type MinorSeed = { minor: UniverseBody; notes: DraftNote[] };

export function buildUniverseGraph(entries: PageManifestEntry[]): UniverseGraphModel {
  const sun: UniverseBody = {
    id: "sun:hub",
    kind: "sun",
    label: "Hub",
    parentId: null,
    count: 0,
    color: "#ffb347",
    soft: "rgba(255, 179, 71, 0.35)",
    ink: "#6c581f",
    r: SUN_RADIUS,
    orbitRadius: 0,
    periodSec: 0,
    phase: 0,
  };

  const base = buildArchiveGraph(entries);
  if (!base.nodes.length) return { bodies: [sun] };

  const majorNodes = base.nodes
    .filter(node => node.kind === "major")
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const beltLabel = pickAsteroidBelt(majorNodes);
  const planetNodes = majorNodes.filter(node => node.label !== beltLabel);
  const layout = solarSystemLayout(planetNodes, Boolean(beltLabel));
  const planets: UniverseBody[] = planetNodes.map((node, index) => {
    const orbitRadius = layout.planetRadii.get(node.label) ?? PLANET_INNER;
    return {
      id: node.id,
      kind: "planet" as const,
      label: node.label,
      parentId: sun.id,
      count: node.count,
      color: node.color,
      soft: node.soft,
      ink: node.ink,
      r: Math.max(10, node.r * 0.48),
      orbitRadius,
      periodSec: periodFor(orbitRadius, 40, 0.006),
      phase: solarPhase(index),
    };
  });

  const planetByLabel = new Map(planets.map(planet => [planet.label, planet]));
  const pairMax = Math.max(
    ...base.links.filter(link => link.kind === "orbit").map(link => link.weight),
    1,
  );

  const namedMinors: UniverseBody[] = base.nodes
    .filter(node => node.kind === "minor")
    .map(node => {
      const planet = planetByLabel.get(node.parentKeyword ?? "");
      const orbit = base.links.find(link => link.kind === "orbit" && String(link.target) === node.id);
      return {
        id: node.id,
        kind: "minorPlanet" as const,
        label: node.label,
        parentId: planet?.id ?? sun.id,
        count: node.count,
        color: node.color,
        soft: node.soft,
        ink: node.ink,
        r: Math.max(5.5, node.r * 0.55),
        orbitRadius: 0,
        periodSec: 0,
        phase: 0,
        order: minorOrbitOrder(orbit?.weight ?? 1, pairMax),
      };
    })
    .sort((a, b) => a.order - b.order || b.count - a.count || a.label.localeCompare(b.label))
    .map(({ order: _order, ...minor }) => minor);

  const parentByKeyword = new Map<string, UniverseBody>();
  for (const planet of planets) parentByKeyword.set(planet.label, planet);
  for (const minor of namedMinors) parentByKeyword.set(minor.label, minor);

  const draftNotes: DraftNote[] = [];
  const beltPaint = majorNodes.find(node => node.label === beltLabel);
  for (const entry of entries) {
    const keywords = [...new Set(topicKeywords(entry.tags))];
    if (!keywords.length) continue;
    const share = 1 / keywords.length;
    for (const keyword of keywords) {
      if (keyword === beltLabel) {
        draftNotes.push({
          id: `note:${entry.id}:${keyword}`,
          kind: "asteroid",
          label: entry.title,
          parentId: sun.id,
          pageId: entry.id,
          excerpt: entry.excerpt,
          count: 1,
          color: beltPaint?.color ?? "#c9a35c",
          soft: beltPaint?.soft ?? "rgba(201, 163, 92, 0.7)",
          ink: beltPaint?.ink ?? "#6c581f",
          r: 1.8,
          orbitRadius: layout.beltInner,
          periodSec: 14,
          phase: 0,
          share,
        });
        continue;
      }
      const parent = parentByKeyword.get(keyword);
      if (!parent) continue;
      draftNotes.push({
        id: `note:${entry.id}:${keyword}`,
        kind: "note",
        label: entry.title,
        parentId: parent.id,
        pageId: entry.id,
        excerpt: entry.excerpt,
        count: 1,
        color: parent.color,
        soft: parent.soft,
        ink: parent.ink,
        r: NOTE_RADIUS,
        orbitRadius: NOTE_RADIUS,
        periodSec: 14,
        phase: 0,
        share,
      });
    }
  }

  draftNotes.sort((a, b) => b.share - a.share || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  const notesByParent = new Map<string, DraftNote[]>();
  const asteroids: DraftNote[] = [];
  for (const note of draftNotes) {
    if (note.kind === "asteroid") {
      asteroids.push(note);
      continue;
    }
    const key = note.parentId ?? sun.id;
    const list = notesByParent.get(key) ?? [];
    list.push(note);
    notesByParent.set(key, list);
  }

  const seedsByPlanet = new Map<string, MinorSeed[]>();
  for (const minor of namedMinors) {
    const key = minor.parentId ?? sun.id;
    const list = seedsByPlanet.get(key) ?? [];
    list.push({ minor, notes: notesByParent.get(minor.id) ?? [] });
    seedsByPlanet.set(key, list);
  }

  for (const planet of planets) {
    const seeds = seedsByPlanet.get(planet.id) ?? [];
    const rings = stretchedRingSpan(planet.r);
    const minorInner = rings.inner + NOTE_RING_GAP / 2;
    const slots = beltOrbitSlots(
      seeds.length,
      minorInner,
      minorInner + (NOTE_RINGS - 1) * NOTE_RING_GAP * LEVEL_SHARE.minorPlanet,
      NOTE_RINGS,
    );
    seeds.forEach(({ minor, notes: pack }, index) => {
      const slot = slots[index] ?? { radius: rings.outer * LEVEL_SHARE.minorPlanet, phase: evenPhase(index, seeds.length) };
      minor.orbitRadius = slot.radius;
      minor.periodSec = periodFor(slot.radius, 18, 0.03);
      minor.phase = slot.phase;
      const noteOuter = Math.max(rings.outer * LEVEL_SHARE.note, Math.max(40, rings.outer - minor.orbitRadius));
      placeNotesOnRings(minor, pack, noteOuter);
    });
    placeNotesOnRings(planet, notesByParent.get(planet.id) ?? [], rings.outer);
  }

  const beltMinors = seedsByPlanet.get(sun.id) ?? [];
  if (beltMinors.length) {
    const slots = beltOrbitSlots(beltMinors.length, layout.beltInner, layout.beltOuter, Math.min(NOTE_RINGS, BELT_RINGS));
    const budget = clusterBudget(
      (layout.beltInner + layout.beltOuter) / 2,
      layout.beltInner,
      layout.beltOuter,
    );
    beltMinors.forEach(({ minor, notes: pack }, index) => {
      const slot = slots[index] ?? { radius: layout.beltInner, phase: evenPhase(index, beltMinors.length) };
      minor.orbitRadius = slot.radius;
      minor.periodSec = periodFor(slot.radius, 18, 0.03);
      minor.phase = slot.phase;
      placeNotesOnRings(minor, pack, budget.note);
    });
  }

  const asteroidSlots = beltOrbitSlots(asteroids.length, layout.beltInner, layout.beltOuter);
  asteroids.forEach((rock, index) => {
    const slot = asteroidSlots[index] ?? { radius: layout.beltInner, phase: evenPhase(index, asteroids.length) };
    rock.orbitRadius = slot.radius;
    rock.periodSec = periodFor(slot.radius, 80, 0.008);
    rock.phase = slot.phase;
  });

  const notes: UniverseBody[] = draftNotes.map(({ share: _share, ...note }) => note);
  return { bodies: applySpeedJitter([sun, ...planets, ...namedMinors, ...notes]) };
}
