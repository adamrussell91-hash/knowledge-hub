import { describe, expect, it } from "vitest";
import {
  NOTE_RINGS,
  PLANET_GAP,
  PLANET_ORBITS,
  SUN_KEEP_OUT,
  SUN_RADIUS,
  buildUniverseGraph,
  evenOrbitSlots,
  minorOrbitOrder,
  orbitSpeedJitter,
  pickAsteroidBelt,
  type UniverseBody,
} from "./universeGraph";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: "" };
}

const MAJORS = [
  "Educational Psychology",
  "Pedagogy & Instructional Design",
  "Wellbeing & Mental Health in Schools",
  "Child Development & Wellbeing",
  "Learning Strategies",
  "Gifted Education",
  "Neurodiversity & Special Education",
  "Cognitive Neuroscience",
];

const MINORS = [
  "Educational Leadership & Policy",
  "Technology in Education",
  "Assessment & Evaluation",
  "Sociocultural Influences on Education",
];

function busyArchive(size = 400) {
  return Array.from({ length: size }, (_, index) => {
    const tags = [MAJORS[index % MAJORS.length], MAJORS[(index + 1) % MAJORS.length]];
    if (index % 3 === 0) tags.push(MINORS[index % MINORS.length]);
    return page(`p${index}`, `Note ${index}`, tags);
  });
}

function siblingGroups(bodies: UniverseBody[]) {
  const groups = new Map<string, UniverseBody[]>();
  for (const body of bodies) {
    if (!body.parentId) continue;
    const list = groups.get(body.parentId) ?? [];
    list.push(body);
    groups.set(body.parentId, list);
  }
  return [...groups.values()];
}

function circlesIn(group: UniverseBody[]) {
  const circles = new Map<string, number[]>();
  for (const body of group) {
    const key = body.orbitRadius.toFixed(4);
    const list = circles.get(key) ?? [];
    list.push(body.phase);
    circles.set(key, list);
  }
  return circles;
}

function expectEvenlySpaced(phases: number[]) {
  if (phases.length < 3) return;
  const sorted = [...phases].sort((a, b) => a - b);
  const step = sorted[1]! - sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(step, 8);
  }
}

/** Worst case: every inner orbit lines up sunward, so this is how close the body can ever get. */
function closestApproachToSun(body: UniverseBody, byId: Map<string, UniverseBody>) {
  const chain: number[] = [];
  let node: UniverseBody | undefined = body;
  while (node?.parentId) {
    chain.push(node.orbitRadius);
    node = byId.get(node.parentId);
  }
  const planetOrbit = chain.at(-1) ?? 0;
  const inner = chain.slice(0, -1).reduce((sum, radius) => sum + radius, 0);
  return planetOrbit - inner;
}

describe("buildUniverseGraph", () => {
  it("places a fake sun, planets for majors, and twin moons for a two-keyword note", () => {
    const majors = [
      "Educational Psychology",
      "Pedagogy & Instructional Design",
      "Wellbeing & Mental Health in Schools",
      "Child Development & Wellbeing",
      "Learning Strategies",
      "Gifted Education",
      "Neurodiversity & Special Education",
      "Cognitive Neuroscience",
    ];
    const pages = majors.map((tag, index) => page(`m${index}`, `Major ${index}`, [tag, majors[(index + 1) % majors.length]]));
    pages.push(page("twin", "Twin note", ["Educational Psychology", "Gifted Education"]));
    pages.push(page("only", "Only psych", ["Educational Psychology"]));

    const model = buildUniverseGraph(pages);
    expect(model.bodies.some(body => body.kind === "sun")).toBe(true);
    expect(model.bodies.filter(body => body.kind === "planet")).toHaveLength(8);

    const twins = model.bodies.filter(body => body.pageId === "twin");
    expect(twins).toHaveLength(2);
    expect(twins.some(body => body.kind === "asteroid")).toBe(true);
    expect(
      twins.some(body => model.bodies.find(item => item.id === body.parentId)?.kind === "planet"),
    ).toBe(true);
  });

  it("places stronger co-occurrence minors earlier around their shared orbit", () => {
    expect(minorOrbitOrder(8, 8)).toBeLessThan(minorOrbitOrder(1, 8));
  });

  it("picks Cognitive Psychology as the asteroid belt when that major exists", () => {
    expect(
      pickAsteroidBelt([
        { label: "Gifted Education", count: 40 },
        { label: "Cognitive Psychology", count: 12 },
        { label: "Educational Psychology", count: 80 },
      ]),
    ).toBe("Cognitive Psychology");
  });

  it("falls back to Educational Psychology, then the busiest major", () => {
    expect(pickAsteroidBelt([{ label: "Educational Psychology", count: 10 }, { label: "Gifted Education", count: 80 }])).toBe(
      "Educational Psychology",
    );
    expect(pickAsteroidBelt([{ label: "Pedagogy & Instructional Design", count: 3 }, { label: "Gifted Education", count: 9 }])).toBe(
      "Gifted Education",
    );
  });

  it("puts planets on 8 separate solar orbits, not one ring, a line, or a spiral", () => {
    const pages = MAJORS.flatMap((tag, index) => {
      const copies = tag === "Educational Psychology" ? 40 : tag === "Gifted Education" ? 2 : 6;
      return Array.from({ length: copies }, (_, copy) =>
        page(`${index}-${copy}`, `${tag} ${copy}`, [tag, MAJORS[(index + 1) % MAJORS.length]]),
      );
    });
    const model = buildUniverseGraph(pages);
    const planets = model.bodies.filter(body => body.kind === "planet");
    expect(PLANET_ORBITS).toBe(8);
    expect(planets).toHaveLength(8);
    expect(planets.some(planet => planet.label === "Educational Psychology")).toBe(true);
    const radii = planets.map(planet => planet.orbitRadius).sort((a, b) => a - b);
    expect(new Set(radii).size).toBe(PLANET_ORBITS);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]! - radii[i - 1]!).toBe(PLANET_GAP);
    }
    expect(radii.at(-1)! - radii[0]!).toBe(PLANET_GAP * (PLANET_ORBITS - 1));
    expect(new Set(planets.map(planet => planet.phase.toFixed(4))).size).toBe(planets.length);
    const byRadius = [...planets].sort((a, b) => a.orbitRadius - b.orbitRadius);
    const spiralSteps = byRadius.slice(1).map((planet, index) => planet.phase - byRadius[index]!.phase);
    const mean = spiralSteps.reduce((sum, step) => sum + step, 0) / spiralSteps.length;
    const spiral = spiralSteps.every(step => Math.abs(step - mean) < 0.05 && step > 0.2);
    expect(spiral).toBe(false);
  });

  it("parks four smaller planets inside the psychology belt, then the remaining planets outside", () => {
    const pages = MAJORS.flatMap((tag, index) => {
      const copies = tag === "Educational Psychology" ? 50 : 4 + index;
      return Array.from({ length: copies }, (_, copy) => page(`${tag}-${copy}`, `${tag} ${copy}`, [tag]));
    });
    const model = buildUniverseGraph(pages);
    const planets = model.bodies.filter(body => body.kind === "planet");
    const belt = model.bodies.filter(body => body.kind === "asteroid");
    expect(belt.length).toBeGreaterThan(20);
    const beltMin = Math.min(...belt.map(body => body.orbitRadius));
    const beltMax = Math.max(...belt.map(body => body.orbitRadius));
    const inner = planets.filter(planet => planet.orbitRadius < beltMin);
    const outer = planets.filter(planet => planet.orbitRadius > beltMax);
    expect(inner).toHaveLength(4);
    expect(outer.length).toBe(planets.length - 4);
    expect(inner.every(planet => planet.count <= Math.max(...outer.map(item => item.count)))).toBe(true);
    expect(new Set(belt.map(body => body.orbitRadius)).size).toBeGreaterThan(1);
    expect(belt.every(body => body.parentId === "sun:hub")).toBe(true);
  });

  it("gives outer planets slower years so the solar system is not a carousel", () => {
    const model = buildUniverseGraph(busyArchive());
    const planets = [...model.bodies.filter(body => body.kind === "planet")].sort(
      (a, b) => a.orbitRadius - b.orbitRadius,
    );
    expect(planets[0]!.periodSec).toBeLessThan(planets.at(-1)!.periodSec);
    const notes = model.bodies.filter(body => body.kind === "note" || body.kind === "asteroid");
    expect(new Set(notes.map(note => note.periodSec.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("never gives a lone sibling its own orbit radius, which is what reads as a spiral arm", () => {
    const model = buildUniverseGraph(busyArchive());
    for (const group of siblingGroups(model.bodies)) {
      if (group.length < 2) continue;
      if (group[0]?.parentId === "sun:hub") continue;
      for (const [, phases] of circlesIn(group)) {
        if (phases.length < 2) continue;
        expectEvenlySpaced(phases);
      }
    }
  });

  it("keeps every body clear of the sun no matter how its orbits line up", () => {
    expect(SUN_RADIUS).toBeGreaterThanOrEqual(40);
    expect(SUN_KEEP_OUT).toBeGreaterThan(SUN_RADIUS * 2);
    const model = buildUniverseGraph(busyArchive());
    const byId = new Map(model.bodies.map(body => [body.id, body]));
    for (const body of model.bodies) {
      if (body.kind === "sun") continue;
      expect(closestApproachToSun(body, byId)).toBeGreaterThan(SUN_KEEP_OUT);
    }
  });

  it("keeps each planet's notes in its own solar lane, not spilling onto the next planet's orbit", () => {
    expect(PLANET_GAP).toBe(45000);
    expect(NOTE_RINGS).toBe(10);
    const model = buildUniverseGraph(busyArchive());
    const planets = [...model.bodies.filter(body => body.kind === "planet")].sort(
      (a, b) => a.orbitRadius - b.orbitRadius,
    );
    expect(planets).toHaveLength(8);
    for (let i = 1; i < planets.length; i++) {
      expect(planets[i]!.orbitRadius - planets[i - 1]!.orbitRadius).toBe(PLANET_GAP);
    }

    for (const planet of planets) {
      const notes = model.bodies.filter(body => body.kind === "note" && body.parentId === planet.id);
      if (notes.length < NOTE_RINGS) continue;
      const radii = [...new Set(notes.map(note => note.orbitRadius))].sort((a, b) => a - b);
      expect(radii).toHaveLength(NOTE_RINGS);
      expect(Math.max(...radii)).toBeLessThanOrEqual(PLANET_GAP / 2);
      const sizes = radii.map(radius => notes.filter(note => note.orbitRadius === radius).length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      for (const radius of radii) expectEvenlySpaced(notes.filter(note => note.orbitRadius === radius).map(note => note.phase));
    }
  });

  it("fills one circle before starting another, and fills every circle evenly", () => {
    const single = evenOrbitSlots(6, 900, 6);
    expect(single).toHaveLength(6);
    expect(new Set(single.map(slot => slot.radius)).size).toBe(1);
    expect(single.every(slot => slot.radius <= 900)).toBe(true);
    expectEvenlySpaced(single.map(slot => slot.phase));

    const crowded = evenOrbitSlots(80, 60, 2.2);
    expect(crowded).toHaveLength(80);
    expect(crowded.every(slot => slot.radius <= 60)).toBe(true);
    const circles = new Map<string, number[]>();
    for (const slot of crowded) {
      const list = circles.get(slot.radius.toFixed(4)) ?? [];
      list.push(slot.phase);
      circles.set(slot.radius.toFixed(4), list);
    }
    expect(circles.size).toBeGreaterThan(1);
    const sizes = [...circles.values()].map(list => list.length);
    expect(Math.min(...sizes)).toBeGreaterThan(1);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    for (const phases of circles.values()) expectEvenlySpaced(phases);
  });

  it("varies orbit speed by up to 10% per body, and always by the same amount for a given body", () => {
    const tag = "Gifted Education";
    const pages = Array.from({ length: 60 }, (_, index) => page(`n${index}`, `Note ${index}`, [tag]));
    const first = buildUniverseGraph(pages).bodies;
    const second = buildUniverseGraph(pages).bodies;
    const periodById = new Map(second.map(body => [body.id, body.periodSec]));
    for (const body of first) expect(periodById.get(body.id)).toBe(body.periodSec);

    const jitters = first.filter(body => body.kind === "note").map(body => orbitSpeedJitter(body.id));
    expect(Math.min(...jitters)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...jitters)).toBeLessThanOrEqual(1.1);
    expect(new Set(jitters.map(value => value.toFixed(4))).size).toBeGreaterThan(1);

    const notes = first.filter(body => body.kind === "note");
    const sameOrbit = notes.filter(note => note.orbitRadius === notes[0]!.orbitRadius);
    expect(new Set(sameOrbit.map(note => note.periodSec.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("puts a handful of notes on concentric rings around their planet", () => {
    const tag = "Gifted Education";
    const pages = Array.from({ length: 10 }, (_, index) => page(`n${index}`, `Note ${index}`, [tag]));
    const model = buildUniverseGraph(pages);
    const planet = model.bodies.find(body => body.kind === "planet")!;
    const notes = model.bodies.filter(body => body.kind === "note");
    expect(notes.every(note => note.parentId === planet.id)).toBe(true);
    expect(new Set(notes.map(note => note.orbitRadius)).size).toBe(NOTE_RINGS);
    expect(notes[0]!.r).toBe(4.4);
  });

  it("shares one orbit between the minor planets and note packs around the same planet", () => {
    const pages = busyArchive();
    pages.push(page("leadership", "Leadership note", [MINORS[0]]));
    const model = buildUniverseGraph(pages);
    const planets = model.bodies.filter(body => body.kind === "planet");
    for (const planet of planets) {
      const minors = model.bodies.filter(body => body.kind === "minorPlanet" && body.parentId === planet.id);
      if (minors.length < 2) continue;
      for (const [, phases] of circlesIn(minors)) {
        expect(phases.length).toBeGreaterThan(1);
        expectEvenlySpaced(phases);
      }
    }
  });

  it("fans a crowded planet's notes across 10 concentric rings instead of one clump", () => {
    const tag = "Gifted Education";
    const pages = Array.from({ length: 80 }, (_, index) => page(`n${index}`, `Note ${index}`, [tag]));
    const model = buildUniverseGraph(pages);
    const planet = model.bodies.find(body => body.kind === "planet")!;
    const notes = model.bodies.filter(body => body.kind === "note");
    expect(notes.every(note => note.parentId === planet.id)).toBe(true);
    expect(new Set(notes.map(note => note.orbitRadius)).size).toBe(NOTE_RINGS);
    expect(notes.every(note => note.orbitRadius > planet.r * 2)).toBe(true);
  });

  it("still builds a sun when there are no topic keywords", () => {
    const model = buildUniverseGraph([page("x", "Empty", ["Note"])]);
    expect(model.bodies).toHaveLength(1);
    expect(model.bodies[0].kind).toBe("sun");
  });

  it("returns only the sun for an empty archive", () => {
    const model = buildUniverseGraph([]);
    expect(model.bodies).toHaveLength(1);
    expect(model.bodies[0].kind).toBe("sun");
  });

  it("orbits a note tagged with a minor keyword around its moon", () => {
    const majors = [
      "Educational Psychology",
      "Pedagogy & Instructional Design",
      "Wellbeing & Mental Health in Schools",
      "Child Development & Wellbeing",
      "Learning Strategies",
      "Gifted Education",
      "Neurodiversity & Special Education",
      "Cognitive Neuroscience",
    ];
    const minors = [
      "Educational Leadership & Policy",
      "Technology in Education",
      "Assessment & Evaluation",
      "Sociocultural Influences on Education",
    ];
    const pages = Array.from({ length: 200 }, (_, index) => {
      const major = majors[index % majors.length];
      const bridge = majors[(index + 1) % majors.length];
      const tags = [major, bridge];
      if (index % 3 === 0) tags.push(minors[index % minors.length]);
      return page(`p${index}`, `Note ${index}`, tags);
    });
    pages.push(page("leadership", "Leadership note", [minors[0]]));

    const model = buildUniverseGraph(pages);
    const note = model.bodies.find(body => body.pageId === "leadership")!;
    const parent = model.bodies.find(body => body.id === note.parentId)!;
    expect(parent.kind).toBe("minorPlanet");
    expect(parent.label).toBe(minors[0]);
    const rings = model.bodies.filter(body => body.kind === "note" && body.parentId === parent.id);
    expect(new Set(rings.map(body => body.orbitRadius)).size).toBe(NOTE_RINGS);
  });
});
