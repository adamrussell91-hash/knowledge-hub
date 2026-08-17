import type { PageManifestEntry } from "../domain/page";
import { buildArchiveGraph, topicKeywords } from "./keywordGraph";

export type UniverseBodyKind = "sun" | "planet" | "minorPlanet" | "moon" | "moonet" | "note";

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

export const NOTES_PER_MOONET = 5;
export const MOONETS_PER_MOON = 3;
export const MOONS_PER_MINOR = 3;
const NOTES_PER_MINOR = NOTES_PER_MOONET * MOONETS_PER_MOON * MOONS_PER_MINOR;

const PLANET_INNER = 5200;
const PLANET_GAP = 4000;
const PLANET_RINGS = 8;
const MINOR_INNER = 900;
const MINOR_GAP = 480;
const MINOR_RINGS = 12;
const MOON_INNER = 220;
const MOON_GAP = 160;
const MOON_RINGS = 7;
const MOONET_INNER = 90;
const MOONET_GAP = 70;
const MOONET_RINGS = 7;
const NOTE_INNER = 36;
const NOTE_GAP = 28;

export function minorOrbitRadius(weight: number, maxWeight: number) {
  const t = maxWeight <= 0 ? 0 : weight / maxWeight;
  return MINOR_INNER + (1 - t) * 70;
}

export function orbitLanes(count: number, inner: number, gap: number) {
  return Array.from({ length: Math.max(count, 0) }, (_, i) => inner + i * gap);
}

/** Place n bodies across `ringCount` solar-system lanes so they use the full inner→outer span. */
export function spreadOnRings(count: number, ringCount: number, inner: number, gap: number) {
  const rings = orbitLanes(Math.max(ringCount, 1), inner, gap);
  if (count <= 0) return [];
  if (count === 1) return [rings[0]!];
  const last = rings.length - 1;
  return Array.from({ length: count }, (_, i) => rings[Math.round((i / (count - 1)) * last)]!);
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
    body.periodSec /= orbitSpeedJitter(body.id);
  }
  return bodies;
}

export function evenPhase(index: number, count: number) {
  return (Math.PI * 2 * index) / Math.max(count, 1);
}

/** Same-level siblings sit on concentric circles, evenly spaced — never a radius+angle spiral. */
export function placeOnCircularRings(
  count: number,
  ringCount: number,
  inner: number,
  gap: number,
): { radius: number; phase: number }[] {
  if (count <= 0) return [];
  const lanes = Math.max(ringCount, 1);
  const ringRadii = [...new Set(spreadOnRings(Math.min(count, lanes), lanes, inner, gap))];
  const nRings = ringRadii.length;
  const base = Math.floor(count / nRings);
  const extra = count % nRings;
  const out: { radius: number; phase: number }[] = [];
  ringRadii.forEach((radius, ring) => {
    const n = base + (ring < extra ? 1 : 0);
    // Offset by a fraction of this ring's own spacing: one body per ring then lands on an
    // even full-circle spread, and busier rings interleave instead of lining up on a spoke.
    const offset = evenPhase(ring, nRings) / Math.max(n, 1);
    for (let i = 0; i < n; i++) out.push({ radius, phase: evenPhase(i, n) + offset });
  });
  return out;
}

function chunk<T>(items: T[], size: number) {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function paint(parent: UniverseBody) {
  return { color: parent.color, soft: parent.soft, ink: parent.ink };
}

function body(partial: UniverseBody): UniverseBody {
  return partial;
}

type DraftNote = UniverseBody & { share: number };

function fanOutFromMinor(minor: UniverseBody, notes: DraftNote[], sink: UniverseBody[]) {
  const moonGroups = chunk(notes, NOTES_PER_MOONET * MOONETS_PER_MOON);
  const moonSlots = placeOnCircularRings(moonGroups.length, MOON_RINGS, MOON_INNER, MOON_GAP);
  moonGroups.forEach((moonNotes, moonIndex) => {
    const slot = moonSlots[moonIndex] ?? { radius: MOON_INNER, phase: 0 };
    const moon = body({
      id: `moon:${minor.id}:${moonIndex}`,
      kind: "moon",
      label: moonGroups.length === 1 ? minor.label : `${minor.label} ${moonIndex + 1}`,
      parentId: minor.id,
      count: moonNotes.length,
      ...paint(minor),
      r: 4.2,
      orbitRadius: slot.radius,
      periodSec: periodFor(slot.radius, 14, 0.04),
      phase: slot.phase,
    });
    sink.push(moon);
    const moonetGroups = chunk(moonNotes, NOTES_PER_MOONET);
    const moonetSlots = placeOnCircularRings(moonetGroups.length, MOONET_RINGS, MOONET_INNER, MOONET_GAP);
    moonetGroups.forEach((bunch, moonetIndex) => {
      const moonetSlot = moonetSlots[moonetIndex] ?? { radius: MOONET_INNER, phase: 0 };
      const moonet = body({
        id: `moonet:${moon.id}:${moonetIndex}`,
        kind: "moonet",
        label: "",
        parentId: moon.id,
        count: bunch.length,
        ...paint(minor),
        r: 2.8,
        orbitRadius: moonetSlot.radius,
        periodSec: periodFor(moonetSlot.radius, 8, 0.05),
        phase: moonetSlot.phase,
      });
      sink.push(moonet);
      const noteSlots = placeOnCircularRings(bunch.length, 1, NOTE_INNER, NOTE_GAP);
      bunch.forEach((note, noteIndex) => {
        const noteSlot = noteSlots[noteIndex] ?? { radius: NOTE_INNER, phase: evenPhase(noteIndex, bunch.length) };
        note.parentId = moonet.id;
        note.color = moonet.color;
        note.soft = moonet.soft;
        note.ink = moonet.ink;
        note.orbitRadius = noteSlot.radius;
        note.periodSec = periodFor(note.orbitRadius, 6, 0.05);
        note.phase = noteSlot.phase;
      });
    });
  });
}

function splitEven<T>(items: T[], parts: number) {
  const count = Math.max(1, parts);
  const size = Math.ceil(items.length / count);
  return chunk(items, size);
}

function fanOutFromPlanet(planet: UniverseBody, notes: DraftNote[], sink: UniverseBody[]) {
  if (!notes.length) return;
  const target =
    notes.length >= 40
      ? Math.max(8, Math.ceil(notes.length / NOTES_PER_MINOR))
      : Math.max(1, Math.ceil(notes.length / (NOTES_PER_MOONET * MOONETS_PER_MOON)));
  const packs = splitEven(notes, target);
  const slots = placeOnCircularRings(packs.length, MINOR_RINGS, MINOR_INNER, MINOR_GAP);
  packs.forEach((pack, index) => {
    const slot = slots[index] ?? { radius: MINOR_INNER, phase: 0 };
    const minor = body({
      id: `minorPlanet:${planet.id}:pack:${index}`,
      kind: "minorPlanet",
      label: "",
      parentId: planet.id,
      count: pack.length,
      ...paint(planet),
      r: 6,
      orbitRadius: slot.radius,
      periodSec: periodFor(slot.radius, 18, 0.03),
      phase: slot.phase,
    });
    sink.push(minor);
    fanOutFromMinor(minor, pack, sink);
  });
}

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
    r: 18,
    orbitRadius: 0,
    periodSec: 0,
    phase: 0,
  };

  const base = buildArchiveGraph(entries);
  if (!base.nodes.length) return { bodies: [sun] };

  const majorNodes = base.nodes
    .filter(node => node.kind === "major")
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const planetSlots = placeOnCircularRings(majorNodes.length, PLANET_RINGS, PLANET_INNER, PLANET_GAP);
  const planets: UniverseBody[] = majorNodes.map((node, index) => {
    const slot = planetSlots[index] ?? { radius: PLANET_INNER, phase: evenPhase(index, majorNodes.length) };
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
      orbitRadius: slot.radius,
      periodSec: periodFor(slot.radius, 40, 0.006),
      phase: slot.phase,
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
      const planet = planetByLabel.get(node.parentKeyword ?? "") ?? planets[0];
      const orbit = base.links.find(link => link.kind === "orbit" && String(link.target) === node.id);
      const weight = orbit?.weight ?? 1;
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
        orbitRadius: minorOrbitRadius(weight, pairMax),
        periodSec: periodFor(minorOrbitRadius(weight, pairMax), 18, 0.03),
        phase: 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const minorsByPlanet = new Map<string, UniverseBody[]>();
  for (const minor of namedMinors) {
    const list = minorsByPlanet.get(minor.parentId ?? sun.id) ?? [];
    list.push(minor);
    minorsByPlanet.set(minor.parentId ?? sun.id, list);
  }
  for (const siblings of minorsByPlanet.values()) {
    const slots = placeOnCircularRings(siblings.length, MINOR_RINGS, MINOR_INNER, MINOR_GAP);
    siblings.forEach((minor, index) => {
      const slot = slots[index] ?? { radius: MINOR_INNER, phase: evenPhase(index, siblings.length) };
      minor.orbitRadius = slot.radius;
      minor.periodSec = periodFor(minor.orbitRadius, 18, 0.03);
      minor.phase = slot.phase;
    });
  }

  const parentByKeyword = new Map<string, UniverseBody>();
  for (const planet of planets) parentByKeyword.set(planet.label, planet);
  for (const minor of namedMinors) parentByKeyword.set(minor.label, minor);

  const draftNotes: DraftNote[] = [];
  for (const entry of entries) {
    const keywords = [...new Set(topicKeywords(entry.tags))];
    if (!keywords.length) continue;
    const share = 1 / keywords.length;
    for (const keyword of keywords) {
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
        r: 2.2,
        orbitRadius: NOTE_INNER,
        periodSec: 14,
        phase: 0,
        share,
      });
    }
  }

  draftNotes.sort((a, b) => b.share - a.share || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  const extras: UniverseBody[] = [];
  const notesByParent = new Map<string, DraftNote[]>();
  for (const note of draftNotes) {
    const key = note.parentId ?? sun.id;
    const list = notesByParent.get(key) ?? [];
    list.push(note);
    notesByParent.set(key, list);
  }

  for (const minor of namedMinors) {
    fanOutFromMinor(minor, notesByParent.get(minor.id) ?? [], extras);
  }
  for (const planet of planets) {
    fanOutFromPlanet(planet, notesByParent.get(planet.id) ?? [], extras);
  }

  const notes: UniverseBody[] = draftNotes.map(({ share: _share, ...note }) => note);
  return { bodies: applySpeedJitter([sun, ...planets, ...namedMinors, ...extras, ...notes]) };
}
