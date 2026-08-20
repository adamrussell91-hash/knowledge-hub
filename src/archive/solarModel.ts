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
const CURVE = 1.15;
const GOLDEN = 2.39996323;
const TAU = Math.PI * 2;

const PERIOD_BASE = {
  planet: 300,
  minor: 240,
  moon: 150,
  page: 26,
  rock: 300,
} as const;

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

function makeBody(partial: Omit<Body, "idx" | "parent" | "children"> & { children?: Body[] }): Body {
  return {
    idx: -1,
    parent: -1,
    children: partial.children ?? [],
    ...partial,
  };
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
    body.period = PERIOD_BASE[body.kind] * (body.a / 100) ** 1.5;
  }
}

function beltBand(orbits: number[]): [number, number] {
  if (orbits.length >= 5) return [orbits[3]!, orbits[4]!];
  if (orbits.length >= 2) {
    const inner = orbits[Math.min(3, orbits.length - 1)]!;
    const step = orbits[1]! - orbits[0]!;
    return [inner, inner + Math.max(step, 80)];
  }
  return [800, 1400];
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
            r: PAGE_RADIUS,
            sysR: PAGE_RADIUS,
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
        moon.sysR = packOrbits(kids, moon.r, false);
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
      r: Math.max(9, Math.sqrt(major.count) * 0.42),
      sysR: 0,
      a: 0,
      phase: 0,
      period: 0,
      color: paint.fill,
      ink: paint.ink,
      children: [...minorBodies, ...ownMoons],
    });
    const afterMinors = packOrbits(minorBodies, planet.r, true);
    planet.sysR = packOrbits(ownMoons, afterMinors, false);
    return planet;
  });

  const bySize = [...planets].sort((a, b) => a.sysR - b.sysR || a.label.localeCompare(b.label));
  const n = bySize.length;
  const orbits = bySize.map((_, i) => (n <= 1 ? A0 : A0 + (AN - A0) * (i ** CURVE / (n - 1) ** CURVE)));
  for (let i = 0; i < bySize.length; i++) {
    const planet = bySize[i]!;
    planet.a = orbits[i]!;
    planet.phase = i * GOLDEN + (hashUnit(planet.id) - 0.5) * 0.28;
    const gapIn = i === 0 ? orbits[0]! : orbits[i]! - orbits[i - 1]!;
    const gapOut = i === n - 1 ? gapIn : orbits[i + 1]! - orbits[i]!;
    const slot = 0.42 * Math.min(gapIn, gapOut);
    const factor = Math.min(1, slot / Math.max(planet.sysR, 1e-6));
    if (factor < 1) scaleSubtree(planet, factor, false);
  }

  const [beltInner, beltOuter] = beltBand(orbits);
  const span = Math.max(beltOuter - beltInner, 1);
  for (const rock of rocks) {
    rock.a = beltInner + hashUnit(`${rock.id}:a`) * span;
    rock.sysR = rock.r;
  }

  sun.children = [...bySize, ...rocks];
  sun.sysR = Math.max(sun.r, ...sun.children.map(child => child.a + child.sysR), sun.r);

  const bodies: Body[] = [];
  flatten(sun, -1, bodies);
  applyPeriods(bodies);

  const moons = bodies.filter(body => body.kind === "moon");
  const tightest = moons.length ? Math.min(...moons.map(moon => moon.sysR)) : sun.r;

  return {
    bodies,
    sun,
    planets: bySize,
    rocks,
    reach: Math.max(sun.sysR, 1),
    tightest: Math.max(tightest, PAGE_RADIUS),
  };
}
