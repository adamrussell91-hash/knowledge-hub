import { describe, expect, it } from "vitest";
import { TIMELINE_CAP, buildTimeline } from "./build";

const hit = (
  id: string,
  created_at?: string,
  title = id,
): Parameters<typeof buildTimeline>[0][number] => ({
  id,
  title,
  excerpt: title,
  area: "notes",
  created_at,
});

describe("buildTimeline", () => {
  it("returns empty nodes for no hits", () => {
    expect(buildTimeline([])).toMatchObject({ nodes: [], ticks: [], truncated: 0, total: 0, spanLabel: "" });
  });

  it("parks undated notes at t = 0 and sorts dated notes oldest to newest", () => {
    const model = buildTimeline([
      hit("c", "2024-06-01T00:00:00.000Z"),
      hit("u"),
      hit("a", "2023-01-01T00:00:00.000Z"),
    ]);
    expect(model.nodes.map(node => node.id)).toEqual(["u", "a", "c"]);
    expect(model.nodes[0]).toMatchObject({ undated: true, t: 0, dateLabel: "Undated" });
    expect(model.nodes[1].t).toBe(0);
    expect(model.nodes[2].t).toBe(1);
  });

  it("stacks same-day notes in increasing lanes", () => {
    const model = buildTimeline([
      hit("m", "2024-03-10T08:00:00.000Z"),
      hit("n", "2024-03-10T18:00:00.000Z"),
    ]);
    expect(model.nodes.map(node => node.lane)).toEqual([0, 1]);
    expect(model.nodes[0].t).toBe(model.nodes[1].t);
  });

  it("keeps the newest cap notes and reports truncation", () => {
    const hits = Array.from({ length: TIMELINE_CAP + 5 }, (_, index) =>
      hit(`p${index}`, new Date(Date.UTC(2020, 0, 1 + index)).toISOString()),
    );
    const model = buildTimeline(hits);
    expect(model.total).toBe(TIMELINE_CAP + 5);
    expect(model.truncated).toBe(5);
    expect(model.nodes).toHaveLength(TIMELINE_CAP);
    expect(model.nodes.at(-1)?.id).toBe(`p${TIMELINE_CAP + 4}`);
  });

  it("emits year ticks when the span is at least three years", () => {
    const model = buildTimeline([
      hit("a", "2019-06-01T00:00:00.000Z"),
      hit("b", "2024-06-01T00:00:00.000Z"),
    ]);
    expect(model.ticks.some(tick => tick.label === "2019")).toBe(true);
    expect(model.ticks.some(tick => tick.label === "2024")).toBe(true);
    expect(model.spanLabel).toMatch(/2019/);
  });

  it("emits unique tick t values for a same-day span", () => {
    const model = buildTimeline([
      hit("m", "2024-03-10T08:00:00.000Z"),
      hit("n", "2024-03-10T18:00:00.000Z"),
    ]);
    const ts = model.ticks.map(tick => tick.t);
    expect(new Set(ts).size).toBe(ts.length);
    const labelsAtT = new Map<number, string[]>();
    for (const tick of model.ticks) {
      const labels = labelsAtT.get(tick.t) ?? [];
      labels.push(tick.label);
      labelsAtT.set(tick.t, labels);
    }
    for (const labels of labelsAtT.values()) {
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("emits unique tick t values on a month-scale span", () => {
    const model = buildTimeline([
      hit("a", "2024-02-01T00:00:00.000Z"),
      hit("b", "2024-05-01T00:00:00.000Z"),
    ]);
    const ts = model.ticks.map(tick => tick.t);
    expect(new Set(ts).size).toBe(ts.length);
  });

  it("stacks undated and oldest dated notes in different lanes at t = 0", () => {
    const model = buildTimeline([hit("u"), hit("d", "2024-03-10T00:00:00.000Z")]);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0]).toMatchObject({ id: "u", t: 0, undated: true });
    expect(model.nodes[1]).toMatchObject({ id: "d", t: 0, undated: false });
    expect(model.nodes[0].lane).not.toBe(model.nodes[1].lane);
  });
});
