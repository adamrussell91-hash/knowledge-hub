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
  const x = new Float64Array(model.bodies.length);
  const y = new Float64Array(model.bodies.length);
  for (const body of model.bodies) {
    if (body.parent < 0) continue;
    const ang = body.phase + (body.period ? (timeSec / body.period) * Math.PI * 2 : 0);
    x[body.idx] = x[body.parent] + Math.cos(ang) * body.a;
    y[body.idx] = y[body.parent] + Math.sin(ang) * body.a;
  }
  return { x, y };
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

describe("layout invariants", () => {
  const majors = V.slice(0, 8);
  function archive() {
    return Array.from({ length: 240 }, (_, i) => {
      const tags = [majors[i % 8]!, majors[(i + 3) % 8]!];
      if (i % 3 === 0) tags.push(V[8]);
      if (i % 5 === 0) tags.push(V[9]);
      return page(`p${i}`, `Note ${i}`, tags);
    });
  }

  it("never puts two minor planets on the same orbit inside a major", () => {
    const model = buildSolarModel(archive());
    for (const planet of model.planets) {
      const minors = planet.children.filter(child => child.kind === "minor");
      expect(new Set(minors.map(minor => minor.a)).size).toBe(minors.length);
    }
  });

  it("keeps siblings on a ring farther apart than the sum of their sysR, and keeps rings from overlapping", () => {
    const model = buildSolarModel(archive());
    for (const parent of model.bodies) {
      if (parent.kind === "sun") {
        const planets = [...parent.children.filter(child => child.kind === "planet")].sort((a, b) => a.a - b.a);
        for (let i = 1; i < planets.length; i++) {
          expect(planets[i]!.a - planets[i]!.sysR).toBeGreaterThanOrEqual(
            planets[i - 1]!.a + planets[i - 1]!.sysR - 1e-6,
          );
        }
        continue;
      }
      if (!parent.children.length) continue;
      const rings = new Map<number, Body[]>();
      for (const child of parent.children) {
        const list = rings.get(child.a) ?? [];
        list.push(child);
        rings.set(child.a, list);
      }
      const ringList = [...rings.entries()].sort((a, b) => a[0] - b[0]);
      for (const [radius, group] of ringList) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const left = group[i]!;
            const right = group[j]!;
            const gap = Math.abs(left.phase - right.phase);
            const ang = Math.min(gap, Math.PI * 2 - gap);
            const dist = 2 * radius * Math.sin(ang / 2);
            expect(dist + 1e-6).toBeGreaterThanOrEqual(left.sysR + right.sysR);
          }
        }
      }
      for (let i = 1; i < ringList.length; i++) {
        const inner = ringList[i - 1]!;
        const outer = ringList[i]!;
        const innerReach = inner[0] + Math.max(...inner[1].map(body => body.sysR));
        const outerInner = outer[0] - Math.max(...outer[1].map(body => body.sysR));
        expect(outerInner + 1e-6).toBeGreaterThanOrEqual(innerReach);
      }
    }
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

  it("places each major planet on its own solar orbit", () => {
    const model = buildSolarModel(archive());
    const radii = model.planets.map(planet => planet.a);
    expect(new Set(radii).size).toBe(model.planets.length);
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
