/** @vitest-environment node */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { UniverseBody } from "./universeGraph";
import { SUN_RADIUS, buildUniverseGraph } from "./universeGraph";
import {
  advanceOrbitClock,
  isUniverseHot,
  isUniverseSearching,
  mountUniverseView,
  notesToKeep,
  positionAt,
  universeHotIds,
  universeSubtreeIds,
  visualRadius,
} from "./universeView";

function body(partial: Partial<UniverseBody> & Pick<UniverseBody, "id" | "kind">): UniverseBody {
  return {
    label: partial.label ?? partial.id,
    parentId: null,
    count: 1,
    color: "#ffb347",
    soft: "rgba(255, 179, 71, 0.35)",
    ink: "#6c581f",
    r: 8,
    orbitRadius: 0,
    periodSec: 0,
    phase: 0,
    ...partial,
  };
}

function canvasContext() {
  return {
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    fillText() {},
    moveTo() {},
    lineTo() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
}

function installTestDom() {
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = function () {
      return canvasContext() as unknown as CanvasRenderingContext2D;
    };
  }
  if (typeof document !== "undefined") return;

  class TestEl {
    tagName: string;
    className = "";
    hidden = false;
    width = 0;
    height = 0;
    innerHTML = "";
    textContent = "";
    style: Record<string, string> = {};
    children: TestEl[] = [];
    constructor(tag: string) {
      this.tagName = tag.toUpperCase();
    }
    appendChild(el: TestEl) {
      this.children.push(el);
      return el;
    }
    addEventListener() {}
    removeEventListener() {}
    getContext() {
      return canvasContext();
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 720 };
    }
    setPointerCapture() {}
  }

  const documentStub = {
    createElement(tag: string) {
      return new TestEl(tag);
    },
  };
  Object.assign(globalThis, {
    document: documentStub,
    window: globalThis,
    devicePixelRatio: 1,
    innerHeight: 900,
    HTMLCanvasElement: TestEl,
  });
}

describe("positionAt", () => {
  it("places the sun at the origin", () => {
    const sun = body({ id: "sun:hub", kind: "sun", parentId: null });
    expect(positionAt(sun, new Map(), 12, false)).toEqual({ x: 0, y: 0 });
  });

  it("keeps planets visible and the sun dominant when zoomed out to the full solar system", () => {
    expect(visualRadius("planet", 12, 0.034) * 0.034).toBeCloseTo(6);
    const sunOnScreen = visualRadius("sun", SUN_RADIUS, 0.034) * 0.034;
    expect(sunOnScreen).toBeGreaterThan(visualRadius("planet", 12, 0.034) * 0.034 * 2);
  });

  it("scales each frame by the speed control and freezes when asked", () => {
    expect(advanceOrbitClock(0, 2000, 1, false)).toBe(2);
    expect(advanceOrbitClock(0, 2000, 2, false)).toBe(4);
    expect(advanceOrbitClock(5, 2000, 0, false)).toBe(5);
    expect(advanceOrbitClock(5, 2000, 2, true)).toBe(0);
  });

  it("changes pace without jumping the orbits when the speed slider moves", () => {
    const slow = advanceOrbitClock(0, 10000, 0.25, false);
    expect(slow).toBe(2.5);
    expect(advanceOrbitClock(slow, 1000, 1, false)).toBe(3.5);
  });

  it("places a child at orbitRadius along phase when frozen or at time 0", () => {
    const sun = { ...body({ id: "sun:hub", kind: "sun" }), x: 0, y: 0 };
    const planet = body({
      id: "planet:A",
      kind: "planet",
      parentId: sun.id,
      orbitRadius: 100,
      phase: 0,
      periodSec: 40,
    });
    const byId = new Map([[sun.id, sun]]);

    expect(positionAt(planet, byId, 0, false)).toEqual({ x: 100, y: 0 });
    expect(positionAt(planet, byId, 999, true)).toEqual({ x: 100, y: 0 });

    const quarter = { ...planet, phase: Math.PI / 2 };
    const frozen = positionAt(quarter, byId, 0, false);
    expect(frozen.x).toBeCloseTo(0);
    expect(frozen.y).toBeCloseTo(100);
  });
});

describe("universe search", () => {
  const sun = body({ id: "sun:hub", kind: "sun", label: "Hub" });
  const twinA = body({ id: "note:p1:a", kind: "note", label: "Twin note", pageId: "p1", parentId: "planet" });
  const twinB = body({ id: "note:p1:b", kind: "note", label: "Copy elsewhere", pageId: "p1", parentId: "moon" });
  const other = body({ id: "note:p2", kind: "note", label: "Unrelated", pageId: "p2", parentId: "planet" });
  const bodies = [sun, twinA, twinB, other];

  it("treats empty and whitespace queries as not searching", () => {
    expect(isUniverseSearching("")).toBe(false);
    expect(isUniverseSearching("  ")).toBe(false);
    expect(isUniverseSearching("zzz")).toBe(true);
  });

  it("never matches the sun, colours twins via pageId, and greys zero-match queries", () => {
    const hot = universeHotIds(bodies, "twin");
    expect(hot.has("sun:hub")).toBe(false);
    expect(hot.has(twinA.id)).toBe(true);
    expect(hot.has(twinB.id)).toBe(true);
    expect(hot.has(other.id)).toBe(false);

    const none = universeHotIds(bodies, "zzz");
    expect(none.size).toBe(0);
    expect(none.has("sun:hub")).toBe(false);
  });
});

describe("isUniverseHot", () => {
  const sun = body({ id: "sun:hub", kind: "sun", label: "Hub" });
  const planet = body({ id: "planet", kind: "planet", parentId: "sun:hub" });
  const moon = body({ id: "moon", kind: "moon", parentId: "planet" });
  const twinA = body({ id: "note:p1:a", kind: "note", label: "Twin note", pageId: "p1", parentId: "planet" });
  const twinB = body({ id: "note:p1:b", kind: "note", label: "Copy elsewhere", pageId: "p1", parentId: "moon" });
  const other = body({ id: "note:p2", kind: "note", label: "Unrelated", pageId: "p2", parentId: "planet" });
  const bodies = [sun, planet, moon, twinA, twinB, other];

  it("keeps every twin copy hot when a note is selected", () => {
    expect(isUniverseHot(twinA, twinA.id, bodies)).toBe(true);
    expect(isUniverseHot(twinB, twinA.id, bodies)).toBe(true);
    expect(isUniverseHot(other, twinA.id, bodies)).toBe(false);
    expect(isUniverseHot(planet, twinA.id, bodies)).toBe(false);
    expect(isUniverseHot(sun, twinA.id, bodies)).toBe(false);
  });

  it("uses the parent-chain subtree for a planet or moon", () => {
    expect(isUniverseHot(planet, planet.id, bodies)).toBe(true);
    expect(isUniverseHot(moon, planet.id, bodies)).toBe(true);
    expect(isUniverseHot(twinA, planet.id, bodies)).toBe(true);
    expect(isUniverseHot(twinB, planet.id, bodies)).toBe(true);
    expect(isUniverseHot(sun, planet.id, bodies)).toBe(false);

    expect(isUniverseHot(moon, moon.id, bodies)).toBe(true);
    expect(isUniverseHot(twinB, moon.id, bodies)).toBe(true);
    expect(isUniverseHot(twinA, moon.id, bodies)).toBe(false);
    expect(isUniverseHot(planet, moon.id, bodies)).toBe(false);
  });

  it("treats every body as hot when nothing is selected", () => {
    for (const item of bodies) {
      expect(isUniverseHot(item, null, bodies)).toBe(true);
    }
  });
});

describe("universe subtree and LOD", () => {
  it("includes a planet and every descendant whose parent chain reaches it", () => {
    const planet = body({ id: "planet", kind: "planet", parentId: "sun:hub" });
    const moon = body({ id: "moon", kind: "moon", parentId: "planet" });
    const note = body({ id: "note", kind: "note", parentId: "moon" });
    const outsider = body({ id: "other", kind: "note", parentId: "sun:hub" });
    const ids = universeSubtreeIds([planet, moon, note, outsider], "planet");
    expect(ids).toEqual(new Set(["planet", "moon", "note"]));
  });

  it("keeps the nearest 1500 notes plus search-hot notes", () => {
    const notes = Array.from({ length: 1600 }, (_, index) => ({
      id: `n${index}`,
      x: index * 10,
      y: 0,
    }));
    const kept = notesToKeep(notes, { x: 0, y: 0 }, new Set(["n1599"]));
    expect(kept.has("n0")).toBe(true);
    expect(kept.has("n1499")).toBe(true);
    expect(kept.has("n1500")).toBe(false);
    expect(kept.has("n1599")).toBe(true);
    expect(kept.size).toBe(1501);
  });
});

describe("mountUniverseView", () => {
  beforeAll(() => {
    installTestDom();
  });

  beforeEach(() => {
    installTestDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    installTestDom();
  });

  it("cancels its animation frame on teardown so a second mount cannot leave two loops", () => {
    const frames: number[] = [];
    const callbacks: FrameRequestCallback[] = [];
    let id = 0;
    let invokeOnce = true;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      id += 1;
      frames.push(id);
      callbacks.push(cb);
      if (invokeOnce) {
        invokeOnce = false;
        cb(16);
      }
      return id;
    });
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));

    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const model = buildUniverseGraph([]);
    const first = mountUniverseView(host, model, { search: "", onNoteSelect() {} });
    const firstId = frames.at(-1);
    first();
    expect(cancel).toHaveBeenCalledWith(firstId);
    const scheduled = frames.length;
    callbacks[0](32);
    expect(frames.length).toBe(scheduled);

    host.innerHTML = "";
    invokeOnce = true;
    const second = mountUniverseView(host, model, { search: "", onNoteSelect() {} });
    const secondId = frames.at(-1);
    second();
    expect(cancel).toHaveBeenCalledWith(secondId);
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("dims search without remounting the canvas", () => {
    let invokeOnce = true;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      if (invokeOnce) {
        invokeOnce = false;
        cb(16);
      }
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));

    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    const stop = mountUniverseView(host, buildUniverseGraph([]), { search: "", onNoteSelect() {} });
    const canvas = host.children[0];
    expect(typeof stop.setSearch).toBe("function");
    stop.setSearch("zzz");
    expect(host.children[0]).toBe(canvas);
    stop();
  });
});
