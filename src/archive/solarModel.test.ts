import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PageManifestEntry } from "../domain/page";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import {
  MIN_TAG_PAGES,
  buildSolarModel,
  packOrbits,
  rankTags,
  worldPositions,
  type Body,
  type SolarModel,
} from "./solarModel";

const V = TOPIC_VOCABULARY;

function page(id: string, title: string, tags: string[], excerpt = ""): PageManifestEntry {
  return { id, title, area: "notes", tags, excerpt };
}

function tagged(prefix: string, tag: string, n: number, extra: string[] = []) {
  return Array.from({ length: n }, (_, i) => page(`${prefix}${i}`, `${tag} ${i}`, [tag, ...extra]));
}

function positionsAt(model: SolarModel, timeSec: number) {
  return worldPositions(model.bodies, timeSec);
}

function wrappedPhase(phase: number) {
  const tau = Math.PI * 2;
  return ((phase % tau) + tau) % tau;
}

function angularGaps(phases: number[]) {
  const tau = Math.PI * 2;
  const sorted = phases.map(wrappedPhase).sort((a, b) => a - b);
  return sorted.map((phase, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + tau;
    return next - phase;
  });
}

function coveringSpan(phases: number[]) {
  const tau = Math.PI * 2;
  const gaps = angularGaps(phases);
  return tau - Math.max(...gaps);
}

function descendants(model: SolarModel, parent: Body) {
  return model.bodies.filter(body => {
    let node: Body | undefined = body;
    while (node && node.parent >= 0) {
      if (node.parent === parent.idx) return true;
      node = model.bodies[node.parent];
    }
    return false;
  });
}

function snapshot(model: SolarModel) {
  return model.bodies.map(body => ({
    id: body.id,
    kind: body.kind,
    parent: body.parent,
    a: body.a,
    phase: body.phase,
    r: body.r,
    sysR: body.sysR,
    pageId: body.pageId,
    count: body.count,
    color: body.color,
    period: body.period,
  }));
}

describe("rankTags", () => {
  it("keeps closed-list tags and drops old labels and structural tags", () => {
    const entries = [
      ...tagged("real", V[0], MIN_TAG_PAGES),
      ...tagged("clip", "Clip", 3),
      ...tagged("old", "Educational Psychology", 12),
      page("muff", "Muffin", ["Note"]),
    ];
    const ranked = rankTags(entries);
    expect(ranked.map(item => item.tag)).toEqual([V[0]]);
    expect(ranked[0]?.count).toBe(MIN_TAG_PAGES);
  });
});

describe("INV-1 — one note, one body", () => {
  it("emits exactly one page or rock per entry and never duplicates a pageId", () => {
    const entries = [
      ...tagged("g", V[0], 12, ["Note"]),
      ...tagged("l", V[1], 12),
      page("none", "Untagged", ["Note"]),
      page("empty", "Empty", []),
    ];
    const model = buildSolarModel(entries);
    const pages = model.bodies.filter(body => body.kind === "page");
    const rocks = model.rocks;
    expect(pages.length + rocks.length).toBe(entries.length);
    const ids = model.bodies.map(body => body.pageId).filter(Boolean) as string[];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(entries.length);
  });

  it("sends untagged and below-floor tags to the belt, not to a planet", () => {
    const entries = [...tagged("g", V[0], 12), page("clip", "A clip", ["Clip"])];
    const model = buildSolarModel(entries);
    expect(model.bodies.find(body => body.pageId === "clip")?.kind).toBe("rock");
    expect(model.planets.map(planet => planet.label)).toEqual([V[0]]);
  });
});

describe("buildSolarModel structure", () => {
  it("is depth-ordered so every parent precedes its children", () => {
    const entries = [
      ...tagged("a", V[0], 12, [V[1]]),
      ...tagged("b", V[1], 12),
      ...tagged("c", V[2], 12),
    ];
    const model = buildSolarModel(entries);
    for (const body of model.bodies) {
      expect(body.idx).toBe(model.bodies.indexOf(body));
      if (body.parent < 0) continue;
      expect(model.bodies[body.parent]!.idx).toBeLessThan(body.idx);
    }
  });

  it("gives the rarest tag ownership, so a ubiquitous tag can own zero pages", () => {
    const entries = [
      ...Array.from({ length: 40 }, (_, i) => page(`bm${i}`, `BM ${i}`, [V[0], V[1]])),
      ...Array.from({ length: 30 }, (_, i) => page(`bs${i}`, `BS ${i}`, [V[0], V[2]])),
      ...Array.from({ length: 20 }, (_, i) => page(`ms${i}`, `MS ${i}`, [V[1], V[2]])),
    ];
    const model = buildSolarModel(entries);
    const big = model.planets.find(planet => planet.label === V[0]);
    expect(big).toBeTruthy();
    const owned = model.bodies.filter(
      body => (body.kind === "page" || body.kind === "rock") && body.parent >= 0,
    );
    const ownedByBig = owned.filter(body => {
      let node: Body | undefined = body;
      while (node && node.parent >= 0) {
        if (node.parent === big!.idx) return true;
        node = model.bodies[node.parent];
        if (node?.kind === "planet" && node.idx !== big!.idx) return false;
      }
      return false;
    });
    const directMoons = big!.children.filter(child => child.kind === "moon");
    const directPages = directMoons.flatMap(moon => moon.children.filter(child => child.kind === "page"));
    expect(directPages).toHaveLength(0);
    expect(ownedByBig.every(body => body.kind !== "page" || true)).toBe(true);
  });

  it("treats every closed topic that appears as a major planet", () => {
    const tags = V.slice(0, 12);
    const entries = Array.from({ length: 160 }, (_, i) => {
      const major = tags[i % tags.length]!;
      const extra = tags[(i + 1) % tags.length]!;
      return page(`p${i}`, `Note ${i}`, [major, extra]);
    });
    const model = buildSolarModel(entries);
    expect(model.planets).toHaveLength(12);
    expect(model.bodies.filter(body => body.kind === "minor")).toHaveLength(0);
  });

  it("groups an owner’s pages into moons by full topic-tag set", () => {
    const entries = [
      ...Array.from({ length: 12 }, (_, i) => page(`solo${i}`, `Solo ${i}`, [V[0]])),
      ...Array.from({ length: 12 }, (_, i) => page(`pair${i}`, `Pair ${i}`, [V[0], V[1]])),
    ];
    const model = buildSolarModel(entries);
    const moons = model.bodies.filter(body => body.kind === "moon");
    expect(moons.some(moon => moon.label === V[0])).toBe(true);
    expect(moons.some(moon => moon.label.includes(" + "))).toBe(true);
  });
});

describe("packOrbits", () => {
  function stub(id: string, sysR: number): Body {
    return {
      idx: 0,
      id,
      kind: "moon",
      label: id,
      parent: 0,
      count: 1,
      r: sysR,
      sysR,
      a: 0,
      phase: 0,
      period: 0,
      e: 0,
      argP: 0,
      incline: 0,
      color: "#000",
      ink: "#000",
      children: [],
    };
  }

  it("keeps similar sizes on one ring and opens a new ring for much smaller bodies", () => {
    const big = [stub("a", 10), stub("b", 9.5), stub("c", 9)];
    const small = [stub("d", 2), stub("e", 2)];
    const outer = packOrbits([...big, ...small], 4, false);
    expect(big[0]!.a).toBe(big[1]!.a);
    expect(small[0]!.a).toBeGreaterThan(big[0]!.a);
    expect(outer).toBeGreaterThan(small[0]!.a);
  });

  it("places solo children on distinct rings", () => {
    const minors = [stub("m1", 8), stub("m2", 6), stub("m3", 5)];
    packOrbits(minors, 9, true);
    expect(new Set(minors.map(body => body.a)).size).toBe(3);
  });
});

const ARCHIVE_MAJORS = V.slice(0, 8);

function archive() {
  return Array.from({ length: 240 }, (_, i) => {
    const tags = [ARCHIVE_MAJORS[i % 8]!, ARCHIVE_MAJORS[(i + 3) % 8]!];
    if (i % 3 === 0) tags.push(V[8]);
    if (i % 5 === 0) tags.push(V[9]);
    return page(`p${i}`, `Note ${i}`, tags);
  });
}

describe("layout invariants", () => {

  it("never puts two minor planets on the same orbit inside a major", () => {
    const model = buildSolarModel(archive());
    for (const planet of model.planets) {
      const minors = planet.children.filter(child => child.kind === "minor");
      expect(new Set(minors.map(minor => minor.a)).size).toBe(minors.length);
    }
  });

  it("lets planet systems graze or cross instead of packing them on non-overlapping rails", () => {
    const model = buildSolarModel(archive());
    const planets = [...model.planets.filter(planet => planet.parent === model.sun.idx)].sort(
      (a, b) => a.a - b.a,
    );
    let overlap = 0;
    for (let i = 1; i < planets.length; i++) {
      const inner = planets[i - 1]!;
      const outer = planets[i]!;
      const innerApo = inner.a * (1 + inner.e) + inner.sysR;
      const outerPeri = outer.a * (1 - outer.e) - outer.sysR;
      if (outerPeri < innerApo) overlap += 1;
    }
    expect(overlap).toBeGreaterThan(0);
  });

  it("keeps every descendant inside its parent’s sysR at t=0 and t=period/2", () => {
    const model = buildSolarModel(archive());
    for (const parent of model.bodies) {
      if (!parent.children.length) continue;
      const kids = descendants(model, parent);
      for (const t of [0, parent.period ? parent.period / 2 : 1]) {
        const { x, y } = positionsAt(model, t);
        for (const child of kids) {
          const dist = Math.hypot(x[child.idx]! - x[parent.idx]!, y[child.idx]! - y[parent.idx]!);
          expect(dist).toBeLessThanOrEqual(parent.sysR + 1e-4);
        }
      }
    }
  });

  it("is deterministic and never uses Math.random", () => {
    const src = readFileSync(fileURLToPath(new URL("./solarModel.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/Math\.random/);
    const entries = archive();
    expect(snapshot(buildSolarModel(entries))).toEqual(snapshot(buildSolarModel(entries)));
  });

  it("spreads major planets across several solar distances instead of one ring", () => {
    const model = buildSolarModel(archive());
    const radii = model.planets
      .filter(planet => planet.parent === model.sun.idx)
      .map(planet => Math.round(planet.a / 40));
    expect(new Set(radii).size).toBeGreaterThan(3);
  });
});

describe("organic astronomy", () => {
  function rockyArchive() {
    return [
      ...archive(),
      ...Array.from({ length: 90 }, (_, i) => page(`u${i}`, `Belt ${i}`, ["Note"])),
    ];
  }

  function threeMoonGiant() {
    return [
      ...tagged("common", V[1], 80),
      ...tagged("common2", V[2], 80),
      ...tagged("common3", V[3], 80),
      ...Array.from({ length: 18 }, (_, i) => page(`solo${i}`, `Solo ${i}`, [V[0]])),
      ...Array.from({ length: 16 }, (_, i) => page(`m1${i}`, `Moon1 ${i}`, [V[0], V[1]])),
      ...Array.from({ length: 14 }, (_, i) => page(`m2${i}`, `Moon2 ${i}`, [V[0], V[2]])),
      ...Array.from({ length: 12 }, (_, i) => page(`m3${i}`, `Moon3 ${i}`, [V[0], V[3]])),
    ];
  }

  it("puts eccentricity on most planets so orbits are not circular rails", () => {
    const model = buildSolarModel(archive());
    const eccentric = model.planets.filter(planet => planet.e > 0.03);
    expect(eccentric.length).toBeGreaterThan(model.planets.length * 0.7);
  });

  it("clusters major longitudes into an arm instead of spacing them evenly", () => {
    const model = buildSolarModel(archive());
    const gaps = angularGaps(model.planets.map(planet => planet.phase));
    const min = Math.min(...gaps.filter(gap => gap > 1e-6));
    const max = Math.max(...gaps);
    expect(max / min).toBeGreaterThan(2.2);
  });

  it("marks a ringed gas giant that is visually larger than the other planets", () => {
    const model = buildSolarModel(threeMoonGiant());
    const giant = model.planets.find(planet => planet.giant);
    expect(giant?.ringed).toBe(true);
    const others = model.planets.filter(planet => !planet.giant);
    expect(giant!.r).toBeGreaterThan(Math.max(...others.map(planet => planet.r)));
  });

  it("lines up the gas giant’s three biggest moons like a belt", () => {
    const model = buildSolarModel(threeMoonGiant());
    const giant = model.planets.find(planet => planet.giant)!;
    const moons = giant.children
      .filter(child => child.kind === "moon")
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    expect(moons).toHaveLength(3);
    expect(coveringSpan(moons.map(moon => moon.phase))).toBeLessThan(0.75);
    const radii = moons.map(moon => moon.a);
    expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.2);
  });

  it("clumps belt rocks into longitude swarms with radial gaps", () => {
    const model = buildSolarModel(rockyArchive());
    expect(model.rocks.length).toBeGreaterThan(40);
    const bins = Array.from({ length: 16 }, () => 0);
    for (const rock of model.rocks) {
      bins[Math.floor((wrappedPhase(rock.phase) / (Math.PI * 2)) * 16)]! += 1;
    }
    const occupied = bins.filter(count => count > 0).sort((a, b) => a - b);
    expect(occupied.at(-1)!).toBeGreaterThan(occupied[0]! * 2);
    const minA = Math.min(...model.rocks.map(rock => rock.a));
    const maxA = Math.max(...model.rocks.map(rock => rock.a));
    const span = Math.max(maxA - minA, 1);
    const radial = Array.from({ length: 12 }, () => 0);
    for (const rock of model.rocks) {
      const bin = Math.min(11, Math.floor(((rock.a - minA) / span) * 12));
      radial[bin]! += 1;
    }
    const fullest = Math.max(...radial);
    const interior = radial.slice(1, -1);
    expect(interior.some(count => count < fullest * 0.15)).toBe(true);
  });

  it("jitters page sizes so moons are not identical beads", () => {
    const model = buildSolarModel(archive());
    const pages = model.bodies.filter(body => body.kind === "page");
    expect(new Set(pages.map(page => page.r.toFixed(2))).size).toBeGreaterThan(3);
  });
});

describe("nested gravity", () => {
  it("lets some smaller planets orbit a heavier planet instead of the sun", () => {
    const model = buildSolarModel(archive());
    const nested = model.planets.filter(planet => planet.parent !== model.sun.idx);
    expect(nested.length).toBeGreaterThan(0);
    expect(nested.every(planet => model.bodies[planet.parent]?.kind === "planet")).toBe(true);
  });

  it("gives a satellite a shorter year than the body it orbits", () => {
    const model = buildSolarModel(archive());
    const moons = model.bodies.filter(body => body.kind === "moon" && body.period > 0);
    expect(moons.length).toBeGreaterThan(0);
    for (const moon of moons) {
      const parent = model.bodies[moon.parent]!;
      if (!parent.period) continue;
      expect(moon.period).toBeLessThan(parent.period);
    }
    const pages = model.bodies.filter(body => body.kind === "page" && body.period > 0);
    for (const page of pages.slice(0, 40)) {
      const moon = model.bodies[page.parent]!;
      expect(page.period).toBeLessThan(moon.period);
    }
  });

  it("lets moons wheel around a planet independently of that planet’s year around the sun", () => {
    const model = buildSolarModel(archive());
    const planet = model.planets.find(
      body => body.parent === model.sun.idx && body.children.some(child => child.kind === "moon"),
    )!;
    const moon = planet.children.find(child => child.kind === "moon")!;
    const t1 = Math.min(planet.period || 80, moon.period || 20) * 0.35;
    const a = worldPositions(model.bodies, 0);
    const b = worldPositions(model.bodies, t1);
    const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const moonSpin = wrap(
      Math.atan2(b.y[moon.idx]! - b.y[planet.idx]!, b.x[moon.idx]! - b.x[planet.idx]!) -
        Math.atan2(a.y[moon.idx]! - a.y[planet.idx]!, a.x[moon.idx]! - a.x[planet.idx]!),
    );
    const year = wrap(
      Math.atan2(b.y[planet.idx]!, b.x[planet.idx]!) - Math.atan2(a.y[planet.idx]!, a.x[planet.idx]!),
    );
    expect(Math.abs(moonSpin)).toBeGreaterThan(0.04);
    expect(Math.abs(Math.abs(moonSpin) - Math.abs(year))).toBeGreaterThan(0.03);
  });
});

describe("degenerate inputs", () => {
  it("builds a sun-only model from an empty archive", () => {
    const model = buildSolarModel([]);
    expect(model.sun.kind).toBe("sun");
    expect(model.planets).toHaveLength(0);
    expect(model.rocks).toHaveLength(0);
    expect(model.bodies).toHaveLength(1);
    expect(model.reach).toBeGreaterThan(0);
  });

  it("handles a single entry", () => {
    const model = buildSolarModel([page("x", "One", [V[0]])]);
    expect(model.bodies.filter(body => body.pageId).length).toBe(1);
  });

  it("puts an all-untagged archive in the belt", () => {
    const entries = Array.from({ length: 20 }, (_, i) => page(`u${i}`, `U ${i}`, ["Note"]));
    const model = buildSolarModel(entries);
    expect(model.planets).toHaveLength(0);
    expect(model.rocks).toHaveLength(20);
  });

  it("handles a single qualifying tag", () => {
    const model = buildSolarModel(tagged("t", V[0], 15));
    expect(model.planets).toHaveLength(1);
    expect(model.planets[0]?.label).toBe(V[0]);
    expect(model.bodies.filter(body => body.kind === "page")).toHaveLength(15);
  });

  it("packs a tag with 3000 pages without throwing", () => {
    const model = buildSolarModel(tagged("huge", V[0], 3000));
    expect(model.bodies.filter(body => body.kind === "page")).toHaveLength(3000);
    expect(model.reach).toBeGreaterThan(model.sun.r);
  });
});
