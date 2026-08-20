import type { PageManifestEntry } from "../domain/page";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { colorForTopic, topicKeywords } from "./keywordGraph";

export const MIN_TAG_PAGES = 1;
export const MAJOR_COUNT = TOPIC_VOCABULARY.length;
export const ORBIT_GAP = 2.4;
export const SUN_RADIUS = 26;
export const PAGE_RADIUS = 0.85;
export const ROCK_RADIUS = 1.1;

const A0 = 420;
const AN = 3000;
const TAU = Math.PI * 2;

export type BodyKind = "sun" | "planet" | "minor" | "moon" | "page" | "rock";

export type Body = {
  idx: number;
  id: string;
  kind: BodyKind;
  label: string;
  parent: number;
  pageId?: string;
  excerpt?: string;
  count: number;
  r: number;
  sysR: number;
  a: number;
  phase: number;
  period: number;
  /** 0 = circle. Typical planets 0.04–0.28. */
  e: number;
  argP: number;
  /** 0–1. Squashes the orbit in y so systems don’t all sit on a flat disc. */
  incline: number;
  ringed?: boolean;
  giant?: boolean;
  color: string;
  ink: string;
  children: Body[];
};

export type RankedTag = { tag: string; count: number };

export type SolarModel = {
  bodies: Body[];
  sun: Body;
  planets: Body[];
  rocks: Body[];
  reach: number;
  tightest: number;
};

export function hashUnit(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function lift(hex: string, amount: number) {
  const raw = hex.replace("#", "");
  const mix = (offset: number) => {
    const channel = parseInt(raw.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

function makeBody(
  partial: Omit<Body, "idx" | "parent" | "children" | "e" | "argP" | "incline"> &
    Partial<Pick<Body, "e" | "argP" | "incline" | "children" | "ringed" | "giant">>,
): Body {
  return {
    idx: -1,
    parent: -1,
    e: 0,
    argP: 0,
    incline: 0,
    children: partial.children ?? [],
    ...partial,
  };
}

/** World offset of a body from its parent at time `clock` seconds. */
export function orbitOffset(body: Body, clock: number) {
  const mean = body.phase + (body.period ? (clock / body.period) * TAU : 0);
  const e = body.e || 0;
  const ecc = mean + e * Math.sin(mean);
  const radius = body.a * (1 - e * e) / Math.max(1e-6, 1 + e * Math.cos(ecc));
  const ang = ecc + (body.argP || 0);
  const squash = 1 - Math.min(body.incline || 0, 0.85) * 0.42;
  return { x: Math.cos(ang) * radius, y: Math.sin(ang) * radius * squash };
}

export function massOf(body: Body) {
  return Math.max(body.count, 1) * Math.max(body.r * body.r, 0.4);
}

function subtreeMass(body: Body): number {
  let mass = massOf(body);
  for (const child of body.children) mass += subtreeMass(child);
  return mass;
}

/** Nested Kepler positions with a barycentric wobble so primaries don’t sit locked at the hub. */
export function worldPositions(bodies: Body[], clock: number) {
  const x = new Float64Array(bodies.length);
  const y = new Float64Array(bodies.length);
  const root = bodies.find(body => body.parent < 0) ?? bodies[0];
  if (!root) return { x, y };

  const place = (body: Body, cx: number, cy: number) => {
    const kids = body.children;
    const offs = kids.map(child => orbitOffset(child, clock));
    let mTot = massOf(body);
    let cmx = 0;
    let cmy = 0;
    for (let i = 0; i < kids.length; i++) {
      const mass = subtreeMass(kids[i]!);
      mTot += mass;
      cmx += mass * offs[i]!.x;
      cmy += mass * offs[i]!.y;
    }
    const px = cx - cmx / Math.max(mTot, 1e-6);
    const py = cy - cmy / Math.max(mTot, 1e-6);
    x[body.idx] = px;
    y[body.idx] = py;
    for (let i = 0; i < kids.length; i++) {
      place(kids[i]!, px + offs[i]!.x, py + offs[i]!.y);
    }
  };
  place(root, 0, 0);
  return { x, y };
}

export function rankTags(entries: PageManifestEntry[]): RankedTag[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of new Set(topicKeywords(entry.tags))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_TAG_PAGES)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

function pairWeights(entries: PageManifestEntry[]) {
  const weights = new Map<string, number>();
  for (const entry of entries) {
    const tags = [...new Set(topicKeywords(entry.tags))];
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = pairKey(tags[i]!, tags[j]!);
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
    }
  }
  return weights;
}

export function attachMinors(ranked: RankedTag[], weights: Map<string, number>) {
  const majors = ranked.slice(0, MAJOR_COUNT);
  const minors = ranked.slice(MAJOR_COUNT);
  const ownerOf = new Map<string, string>();
  for (const minor of minors) {
    let bestOwner = majors[0]?.tag ?? minor.tag;
    let bestWeight = -1;
    for (const major of majors) {
      const weight = weights.get(pairKey(minor.tag, major.tag)) ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestOwner = major.tag;
      }
    }
    ownerOf.set(minor.tag, bestOwner);
  }
  return { majors, minors, ownerOf };
}

export function packOrbits(children: Body[], innerRadius: number, solo = false): number {
  if (!children.length) return innerRadius;
  const remaining = [...children].sort((a, b) => b.sysR - a.sysR || a.id.localeCompare(b.id));
  let a = innerRadius;
  while (remaining.length) {
    const head = remaining[0]!;
    const ringR = a + head.sysR;
    const capacity = solo
      ? 1
      : Math.max(1, Math.floor((TAU * ringR) / (2.35 * head.sysR + ORBIT_GAP)));
    const minSize = head.sysR / 1.7;
    const ring: Body[] = [];
    const next: Body[] = [];
    for (const child of remaining) {
      if (ring.length < capacity && child.sysR >= minSize) ring.push(child);
      else next.push(child);
    }
    const slot = TAU / ring.length;
    ring.forEach((child, index) => {
      child.a = ringR;
      child.phase = index * slot + (hashUnit(child.id) - 0.5) * slot * 0.04;
    });
    a = ringR + head.sysR + ORBIT_GAP;
    remaining.length = 0;
    remaining.push(...next);
  }
  return a;
}

function scaleSubtree(body: Body, factor: number, scaleSelfR: boolean) {
  body.sysR *= factor;
  if (scaleSelfR) body.r *= factor;
  for (const child of body.children) {
    child.a *= factor;
    scaleSubtree(child, factor, true);
  }
}

function recomputeSysR(body: Body): number {
  let outer = body.r;
  for (const child of body.children) {
    const reach = child.a * (1 + (child.e || 0)) + recomputeSysR(child);
    if (reach > outer) outer = reach;
  }
  body.sysR = outer;
  return outer;
}

function paintOrbit(body: Body, e0: number, eSpan: number, i0: number, iSpan: number) {
  body.e = e0 + hashUnit(`${body.id}:e`) * eSpan;
  body.argP = hashUnit(`${body.id}:w`) * TAU;
  body.incline = i0 + hashUnit(`${body.id}:i`) * iSpan;
}

function organicizeSwarm(children: Body[], seed: string, inner = 0, span = 0) {
  if (!children.length) return;
  const nClumps =
    children.length <= 2 ? 1 : children.length <= 8 ? 2 : 1 + Math.floor(hashUnit(`${seed}:n`) * 2);
  const centers = Array.from({ length: nClumps }, (_, i) => hashUnit(`${seed}:c:${i}`) * TAU);
  const spread = children.length <= 6 ? 0.7 : 1.05;
  for (const child of children) {
    const clump = Math.floor(hashUnit(`${child.id}:clump`) * nClumps) % nClumps;
    child.phase = centers[clump]! + (hashUnit(`${child.id}:ph`) - 0.5) * spread;
    if (span > 0) child.a = inner + hashUnit(`${child.id}:ra`) * span;
    else child.a *= 0.7 + hashUnit(`${child.id}:ra`) * 0.85;
    paintOrbit(child, 0.1, 0.32, 0.08, 0.55);
  }
}

function scatterPages(moon: Body) {
  const kids = moon.children.filter(child => child.kind === "page");
  if (!kids.length) return;
  const inner = moon.r * 1.8;
  const span = Math.max(5, Math.sqrt(kids.length) * 2.8);
  organicizeSwarm(kids, moon.id, inner, span);
}

function assignMoonOrbits(planet: Body) {
  const moons = planet.children
    .filter(child => child.kind === "moon")
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  if (!moons.length) return;
  const keep = moons.length <= 4 ? moons.length : Math.min(4, Math.max(2, moons.length - Math.ceil(moons.length * 0.55)));
  const majorMoons = moons.slice(0, keep);
  const belt = moons.slice(keep);
  majorMoons.forEach((moon, i) => {
    moon.a = planet.r * (3.4 + i * 3.1 + hashUnit(`${moon.id}:a`) * 3.6);
    moon.phase = hashUnit(`${moon.id}:p`) * TAU;
    paintOrbit(moon, 0.08, 0.28, 0.05, 0.38);
  });
  if (!belt.length) return;
  const inner = planet.r * (10 + majorMoons.length * 2.2);
  const span = planet.r * (12 + Math.sqrt(belt.length) * 2.2);
  const swarms = [0, 1].map(i => hashUnit(`${planet.id}:belt:${i}`) * TAU);
  for (const moon of belt) {
    moon.a = inner + hashUnit(`${moon.id}:ba`) * span;
    const swarm = Math.floor(hashUnit(`${moon.id}:bs`) * 2) % 2;
    moon.phase = swarms[swarm]! + (hashUnit(`${moon.id}:bp`) - 0.5) * 0.9;
    paintOrbit(moon, 0.2, 0.38, 0.22, 0.55);
    moon.r = Math.min(moon.r, 2.4);
  }
}

function placePlanets(planets: Body[]) {
  const bySize = [...planets].sort((a, b) => a.sysR - b.sysR || a.label.localeCompare(b.label));
  const n = bySize.length;
  const arm = hashUnit("solar-arm") * TAU;
  const ranks = bySize.map((_, i) => i);
  if (n >= 4) {
    const swap = 1 + Math.floor(hashUnit("orbit-swap") * (n - 2));
    const left = ranks[swap]!;
    ranks[swap] = ranks[swap - 1]!;
    ranks[swap - 1] = left;
  }
  for (let i = 0; i < n; i++) {
    const planet = bySize[i]!;
    const t = n <= 1 ? 0 : ranks[i]! / (n - 1);
    const jitter = 0.76 + hashUnit(`${planet.id}:a`) * 0.52;
    planet.a = (n <= 1 ? A0 : A0 + (AN - A0) * t ** 1.08) * jitter;
    const wander = hashUnit(`${planet.id}:lon`);
    planet.phase =
      wander < 0.2
        ? hashUnit(`${planet.id}:wander`) * TAU
        : arm + (hashUnit(`${planet.id}:arm`) - 0.5) * 1.38;
    paintOrbit(planet, 0.05, 0.24, 0.06, 0.32);
  }
  for (const planet of bySize) {
    const cap = Math.max(planet.a * 0.82, 80);
    if (planet.sysR > cap) scaleSubtree(planet, cap / planet.sysR, false);
  }
  return bySize;
}

function decorateCharacters(planets: Body[]) {
  if (!planets.length) return;
  const scored = planets
    .map(planet => ({
      planet,
      moons: planet.children.filter(child => child.kind === "moon").length,
    }))
    .sort(
      (a, b) =>
        b.moons - a.moons || b.planet.count - a.planet.count || a.planet.label.localeCompare(b.planet.label),
    );
  const giant = scored[0]!.planet;
  giant.giant = true;
  giant.ringed = true;
  const otherR = Math.max(0, ...planets.filter(planet => planet !== giant).map(planet => planet.r));
  giant.r = Math.max(giant.r * 2.5, otherR * 2.2, 28);
  giant.e = 0.035 + hashUnit(`${giant.id}:ge`) * 0.05;
  const belt = giant.children
    .filter(child => child.kind === "moon")
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  if (belt.length === 3) {
    const mid = (belt[0]!.a + belt[1]!.a + belt[2]!.a) / 3;
    const line = hashUnit(`${giant.id}:belt`) * TAU;
    belt.forEach((moon, i) => {
      moon.a = mid * (0.97 + i * 0.025);
      moon.phase = line + (i - 1) * 0.22;
      moon.e = 0.015;
      moon.argP = 0;
      moon.incline = 0.04;
    });
  }
  const saturn = scored[1]?.planet;
  if (saturn && saturn !== giant) saturn.ringed = true;
}

function placeRocks(rocks: Body[], planets: Body[]) {
  const sorted = [...planets].sort((a, b) => a.a - b.a);
  const beltInner = sorted[1]?.a ? sorted[1].a * 0.82 : 720;
  const beltOuter = sorted[Math.min(4, Math.max(sorted.length - 1, 0))]?.a
    ? sorted[Math.min(4, Math.max(sorted.length - 1, 0))]!.a * 1.12
    : 1680;
  const span = Math.max(beltOuter - beltInner, 1);
  const last = sorted.at(-1)?.a ?? 2200;
  const swarms = [0, 1, 2].map(i => hashUnit(`rock-swarm:${i}`) * TAU);
  const regions: Array<[number, number]> = [
    [0, 0.28],
    [0.36, 0.58],
    [0.66, 1],
  ];
  const regionLen = regions.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
  for (const rock of rocks) {
    const roll = hashUnit(`${rock.id}:family`);
    if (roll < 0.08 && sorted.length) {
      const host = sorted[Math.min(sorted.length - 1, 1 + Math.floor(hashUnit(`${rock.id}:t`) * Math.max(sorted.length - 1, 1)))]!;
      rock.a = host.a * (0.97 + hashUnit(`${rock.id}:ta`) * 0.06);
      rock.phase =
        host.phase +
        (hashUnit(`${rock.id}:tp`) < 0.5 ? 1 : -1) * (Math.PI / 3) +
        (hashUnit(`${rock.id}:tj`) - 0.5) * 0.35;
    } else if (roll < 0.16) {
      rock.a = last * (1.18 + hashUnit(`${rock.id}:k`) * 0.7);
      rock.phase = hashUnit(`${rock.id}:kp`) * TAU;
    } else {
      let walk = hashUnit(`${rock.id}:a`) * regionLen;
      let frac = regions[0]![0];
      for (const [lo, hi] of regions) {
        const len = hi - lo;
        if (walk <= len) {
          frac = lo + walk;
          break;
        }
        walk -= len;
      }
      rock.a = beltInner + frac * span;
      const swarm = Math.floor(hashUnit(`${rock.id}:sw`) * 3) % 3;
      rock.phase = swarms[swarm]! + (hashUnit(`${rock.id}:ph`) - 0.5) * 0.68;
    }
    paintOrbit(rock, 0.12, 0.28, 0.18, 0.55);
    rock.r = ROCK_RADIUS * (0.35 + hashUnit(`${rock.id}:r`) * 1.7);
    rock.sysR = rock.r;
  }
}

function flatten(body: Body, parentIdx: number, out: Body[]) {
  body.idx = out.length;
  body.parent = parentIdx;
  out.push(body);
  for (const child of body.children) flatten(child, body.idx, out);
}

function moonKey(tags: string[]) {
  return [...new Set(topicKeywords(tags))].sort((a, b) => a.localeCompare(b));
}

function ownerOfPage(tags: string[], counts: Map<string, number>, valid: Set<string>) {
  const candidates = [...new Set(topicKeywords(tags))].filter(tag => valid.has(tag));
  if (!candidates.length) return null;
  return candidates.reduce((best, tag) => (counts.get(tag)! < counts.get(best)! ? tag : best));
}

function applyPeriods(bodies: Body[]) {
  for (const body of bodies) {
    if (body.parent < 0 || body.a <= 0 || body.kind === "sun") {
      body.period = 0;
      continue;
    }
    const parent = bodies[body.parent]!;
    const mass = Math.max(massOf(parent), 1);
    let period = Math.max(7, 24 * Math.sqrt(body.a ** 3 / mass));
    if (parent.period > 0 && period >= parent.period * 0.72) {
      period = parent.period * (0.14 + hashUnit(`${body.id}:year`) * 0.42);
    }
    body.period = period;
  }
}

export function buildSolarModel(entries: PageManifestEntry[]): SolarModel {
  const sun = makeBody({
    id: "sun:hub",
    kind: "sun",
    label: "Hub",
    count: entries.length,
    r: SUN_RADIUS,
    sysR: SUN_RADIUS,
    a: 0,
    phase: 0,
    period: 0,
    color: "#ffb347",
    ink: "#6c581f",
  });

  const ranked = rankTags(entries);
  const counts = new Map(ranked.map(item => [item.tag, item.count]));
  const valid = new Set(ranked.map(item => item.tag));
  const { majors, minors, ownerOf } = attachMinors(ranked, pairWeights(entries));
  const colorByTag = new Map(ranked.map(item => [item.tag, colorForTopic(item.tag)]));

  const owned = new Map<string, PageManifestEntry[]>();
  const rocks: Body[] = [];
  for (const entry of entries) {
    const owner = ownerOfPage(entry.tags, counts, valid);
    if (!owner) {
      rocks.push(
        makeBody({
          id: `rock:${entry.id}`,
          kind: "rock",
          label: entry.title,
          pageId: entry.id,
          excerpt: entry.excerpt,
          count: 1,
          r: ROCK_RADIUS,
          sysR: ROCK_RADIUS,
          a: 0,
          phase: hashUnit(entry.id) * TAU,
          period: 0,
          color: "#c4b48a",
          ink: "#6c581f",
        }),
      );
      continue;
    }
    const list = owned.get(owner) ?? [];
    list.push(entry);
    owned.set(owner, list);
  }

  const minorsByMajor = new Map<string, RankedTag[]>();
  for (const minor of minors) {
    const major = ownerOf.get(minor.tag) ?? majors[0]?.tag;
    if (!major) continue;
    const list = minorsByMajor.get(major) ?? [];
    list.push(minor);
    minorsByMajor.set(major, list);
  }

  function moonsFor(owner: string, paint: ReturnType<typeof colorForTopic>) {
    const pages = owned.get(owner) ?? [];
    const groups = new Map<string, { tags: string[]; pages: PageManifestEntry[] }>();
    for (const entry of pages) {
      const tags = moonKey(entry.tags);
      const key = tags.join("\0");
      const group = groups.get(key) ?? { tags, pages: [] };
      group.pages.push(entry);
      groups.set(key, group);
    }
    return [...groups.values()]
      .sort((a, b) => b.pages.length - a.pages.length || a.tags.join(" ").localeCompare(b.tags.join(" ")))
      .map(group => {
        const kids = group.pages.map(entry =>
          makeBody({
            id: `page:${entry.id}`,
            kind: "page",
            label: entry.title,
            pageId: entry.id,
            excerpt: entry.excerpt,
            count: 1,
            r: PAGE_RADIUS * (0.48 + hashUnit(`page-r:${entry.id}`) * 1.2),
            sysR: PAGE_RADIUS * (0.48 + hashUnit(`page-r:${entry.id}`) * 1.2),
            a: 0,
            phase: 0,
            period: 0,
            color: lift(paint.fill, 0.24),
            ink: paint.ink,
          }),
        );
        const moon = makeBody({
          id: `moon:${owner}:${group.tags.join("+")}`,
          kind: "moon",
          label: group.tags.join(" + ") || owner,
          count: kids.length,
          r: Math.min(6, Math.max(1.5, Math.sqrt(kids.length) * 0.62)),
          sysR: 0,
          a: 0,
          phase: 0,
          period: 0,
          color: paint.fill,
          ink: paint.ink,
          children: kids,
        });
        moon.sysR = moon.r;
        scatterPages(moon);
        return moon;
      });
  }

  const planets: Body[] = majors.map(major => {
    const paint = colorByTag.get(major.tag)!;
    const minorBodies = (minorsByMajor.get(major.tag) ?? [])
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .map(minor => {
        const minorPaint = colorByTag.get(minor.tag)!;
        const moons = moonsFor(minor.tag, minorPaint);
        const body = makeBody({
          id: `minor:${minor.tag}`,
          kind: "minor",
          label: minor.tag,
          count: minor.count,
          r: Math.max(3.4, Math.sqrt(minor.count) * 0.3),
          sysR: 0,
          a: 0,
          phase: 0,
          period: 0,
          color: minorPaint.fill,
          ink: minorPaint.ink,
          children: moons,
        });
        body.sysR = packOrbits(moons, body.r, false);
        return body;
      });
    const ownMoons = moonsFor(major.tag, paint);
    const planet = makeBody({
      id: `planet:${major.tag}`,
      kind: "planet",
      label: major.tag,
      count: major.count,
      r: Math.max(6, Math.sqrt(major.count) * 0.85),
      sysR: 0,
      a: 0,
      phase: 0,
      period: 0,
      color: paint.fill,
      ink: paint.ink,
      children: [...minorBodies, ...ownMoons],
    });
    const afterMinors = packOrbits(minorBodies, planet.r, true);
    for (const minor of minorBodies) {
      paintOrbit(minor, 0.04, 0.16, 0.08, 0.4);
      assignMoonOrbits(minor);
    }
    assignMoonOrbits(planet);
    return planet;
  });

  for (const planet of planets) recomputeSysR(planet);
  decorateCharacters(planets);
  for (const planet of planets) recomputeSysR(planet);
  const bySize = placePlanets(planets);
  placeRocks(rocks, bySize);

  sun.children = [...bySize, ...rocks];
  recomputeSysR(sun);

  const bodies: Body[] = [];
  flatten(sun, -1, bodies);
  applyPeriods(bodies);

  const moons = bodies.filter(body => body.kind === "moon");
  const tightest = moons.length ? Math.min(...moons.map(moon => moon.sysR)) : sun.r;

  return {
    bodies,
    sun,
    planets,
    rocks,
    reach: Math.max(sun.sysR, 1),
    tightest: Math.max(tightest, PAGE_RADIUS),
  };
}
