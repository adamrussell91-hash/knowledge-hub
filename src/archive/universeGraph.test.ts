import { describe, expect, it } from "vitest";
import {
  NOTES_PER_MOONET,
  buildUniverseGraph,
  minorOrbitRadius,
  placeOnCircularRings,
  spreadOnRings,
} from "./universeGraph";

function page(id: string, title: string, tags: string[]) {
  return { id, title, area: "notes" as const, tags, excerpt: "" };
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
    expect(new Set(twins.map(body => body.parentId)).size).toBe(2);
    expect(twins.every(body => model.bodies.find(item => item.id === body.parentId)?.kind === "moonet")).toBe(true);
  });

  it("puts stronger co-occurrence minors closer to their planet", () => {
    expect(minorOrbitRadius(8, 8)).toBeLessThan(minorOrbitRadius(1, 8));
  });

  it("gives each planet its own orbit around the sun, busier ones closer in", () => {
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
    const pages = majors.flatMap((tag, index) => {
      const copies = tag === "Educational Psychology" ? 12 : tag === "Gifted Education" ? 2 : 4;
      return Array.from({ length: copies }, (_, copy) =>
        page(`${index}-${copy}`, `${tag} ${copy}`, [tag, majors[(index + 1) % majors.length]]),
      );
    });
    const planets = buildUniverseGraph(pages).bodies.filter(body => body.kind === "planet");
    expect(new Set(planets.map(planet => planet.orbitRadius)).size).toBe(planets.length);
    const psych = planets.find(planet => planet.label === "Educational Psychology")!;
    const gifted = planets.find(planet => planet.label === "Gifted Education")!;
    expect(psych.orbitRadius).toBeLessThan(gifted.orbitRadius);
    expect(psych.orbitRadius).toBeGreaterThanOrEqual(5000);
    const sorted = planets.map(planet => planet.orbitRadius).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThan(3000);
    }
    expect(sorted.at(-1)! - sorted[0]!).toBeGreaterThan(20000);
    const phases = planets.map(planet => planet.phase);
    expect(new Set(phases.map(phase => phase.toFixed(4))).size).toBe(planets.length);
  });

  it("spreads bodies across the full inner-to-outer ring span", () => {
    expect(spreadOnRings(8, 8, 700, 1900)).toEqual([700, 2600, 4500, 6400, 8300, 10200, 12100, 14000]);
    expect(new Set(spreadOnRings(4, 7, 110, 140)).size).toBe(4);
  });

  it("places many siblings on concentric circles instead of a spiral", () => {
    const slots = placeOnCircularRings(20, 7, 220, 160);
    expect(slots).toHaveLength(20);
    const byRadius = new Map<number, number[]>();
    for (const slot of slots) {
      const list = byRadius.get(slot.radius) ?? [];
      list.push(slot.phase);
      byRadius.set(slot.radius, list);
    }
    expect(byRadius.size).toBeLessThan(20);
    expect(byRadius.size).toBeGreaterThan(1);
    const sizes = [...byRadius.values()].map(list => list.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    for (const phases of byRadius.values()) {
      const sorted = [...phases].sort((a, b) => a - b);
      if (sorted.length < 2) continue;
      const step = sorted[1]! - sorted[0]!;
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(step, 8);
      }
    }
  });

  it("puts notes around a moonet on one circular orbit", () => {
    const tag = "Educational Psychology";
    const pages = Array.from({ length: 5 }, (_, index) => page(`n${index}`, `Note ${index}`, [tag]));
    const model = buildUniverseGraph(pages);
    const notes = model.bodies.filter(body => body.kind === "note");
    expect(new Set(notes.map(note => note.parentId)).size).toBe(1);
    expect(new Set(notes.map(note => note.orbitRadius)).size).toBe(1);
    const phases = notes.map(note => note.phase).sort((a, b) => a - b);
    expect(phases[1]! - phases[0]!).toBeCloseTo((Math.PI * 2) / 5, 8);
  });

  it("spreads sibling moons onto concentric orbits, not a unique-radius spiral", () => {
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
      const tags = [major, majors[(index + 1) % majors.length]];
      if (index % 3 === 0) tags.push(minors[index % minors.length]);
      return page(`p${index}`, `Note ${index}`, tags);
    });
    const model = buildUniverseGraph(pages);
    const moons = model.bodies.filter(body => body.kind === "moon");
    const byParent = new Map<string, Array<{ radius: number; phase: number }>>();
    for (const moon of moons) {
      const list = byParent.get(moon.parentId ?? "") ?? [];
      list.push({ radius: moon.orbitRadius, phase: moon.phase });
      byParent.set(moon.parentId ?? "", list);
    }
    for (const siblings of byParent.values()) {
      if (siblings.length < 2) continue;
      const byRadius = new Map<number, number[]>();
      for (const sibling of siblings) {
        const list = byRadius.get(sibling.radius) ?? [];
        list.push(sibling.phase);
        byRadius.set(sibling.radius, list);
      }
      if (siblings.length > 7) expect(byRadius.size).toBeLessThan(siblings.length);
      expect(Math.max(...siblings.map(item => item.radius)) - Math.min(...siblings.map(item => item.radius))).toBeGreaterThan(250);
      for (const phases of byRadius.values()) {
        const sorted = [...phases].sort((a, b) => a - b);
        if (sorted.length < 2) continue;
        const step = sorted[1]! - sorted[0]!;
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(step, 8);
        }
      }
    }
  });

  it("fans a crowded planet into minor planets, moons, and moonets so notes never pile on one host", () => {
    const tag = "Educational Psychology";
    const pages = Array.from({ length: 80 }, (_, index) => page(`n${index}`, `Note ${index}`, [tag]));
    const model = buildUniverseGraph(pages);
    const planet = model.bodies.find(body => body.kind === "planet")!;
    const notes = model.bodies.filter(body => body.kind === "note");
    expect(notes.every(note => note.parentId !== planet.id)).toBe(true);
    expect(model.bodies.filter(body => body.kind === "minorPlanet").length).toBeGreaterThanOrEqual(8);
    expect(model.bodies.some(body => body.kind === "moon")).toBe(true);
    expect(model.bodies.some(body => body.kind === "moonet")).toBe(true);
    expect(notes.every(note => model.bodies.find(item => item.id === note.parentId)?.kind === "moonet")).toBe(true);

    const childCount = new Map<string, number>();
    for (const body of model.bodies) {
      if (!body.parentId) continue;
      childCount.set(body.parentId, (childCount.get(body.parentId) ?? 0) + 1);
    }
    const noteLoads = [...childCount.entries()]
      .filter(([id]) => model.bodies.find(body => body.id === id)?.kind === "moonet")
      .map(([, count]) => count);
    expect(Math.max(...noteLoads)).toBeLessThanOrEqual(NOTES_PER_MOONET);
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
    expect(parent.kind).toBe("moonet");
    const moon = model.bodies.find(body => body.id === parent.parentId)!;
    expect(moon.kind).toBe("moon");
    const minor = model.bodies.find(body => body.id === moon.parentId)!;
    expect(minor.kind).toBe("minorPlanet");
    expect(minor.label).toBe(minors[0]);
  });
});
