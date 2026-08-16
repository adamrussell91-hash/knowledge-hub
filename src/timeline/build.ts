import type { PageArea } from "../domain/page";

export const TIMELINE_CAP = 120;

export type TimelineHit = {
  id: string;
  title: string;
  excerpt: string;
  area: PageArea;
  created_at?: string;
};

export type TimelineNode = TimelineHit & {
  t: number;
  lane: number;
  undated: boolean;
  dateLabel: string;
};

export type TimelineTick = { t: number; label: string };

export type TimelineModel = {
  nodes: TimelineNode[];
  ticks: TimelineTick[];
  truncated: number;
  total: number;
  spanLabel: string;
};

function stamp(value?: string) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayMsOf(ms: number) {
  return Date.parse(`${dayKey(ms)}T00:00:00.000Z`);
}

function dateLabel(ms: number | null) {
  if (ms === null) return "Undated";
  return new Date(ms).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function yearLabel(ms: number) {
  return String(new Date(ms).getUTCFullYear());
}

function monthLabel(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function dayLabel(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ticksFor(min: number, max: number): TimelineTick[] {
  const span = max - min || 1;
  const tOf = (ms: number) => (ms - min) / span;
  const years = (max - min) / (365.25 * 24 * 3600 * 1000);
  const days = (max - min) / (24 * 3600 * 1000);
  const ticks: TimelineTick[] = [{ t: 0, label: years >= 3 ? yearLabel(min) : days >= 60 ? monthLabel(min) : dayLabel(min) }];
  if (years >= 3) {
    for (let year = new Date(min).getUTCFullYear() + 1; year < new Date(max).getUTCFullYear(); year++) {
      ticks.push({ t: tOf(Date.UTC(year, 0, 1)), label: String(year) });
    }
    if (yearLabel(max) !== yearLabel(min)) ticks.push({ t: 1, label: yearLabel(max) });
  } else if (days >= 60) {
    const cursor = new Date(Date.UTC(new Date(min).getUTCFullYear(), new Date(min).getUTCMonth(), 1));
    const end = new Date(max);
    while (cursor <= end) {
      ticks.push({ t: tOf(cursor.getTime()), label: monthLabel(cursor.getTime()) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    const cursor = new Date(Date.UTC(new Date(min).getUTCFullYear(), new Date(min).getUTCMonth(), new Date(min).getUTCDate()));
    const end = new Date(max);
    while (cursor <= end) {
      ticks.push({ t: tOf(cursor.getTime()), label: dayLabel(cursor.getTime()) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  if (!ticks.some(tick => tick.t === 1)) {
    ticks.push({
      t: 1,
      label: years >= 3 ? yearLabel(max) : days >= 60 ? monthLabel(max) : dayLabel(max),
    });
  }
  const unique = new Map<number, TimelineTick>();
  for (const tick of ticks) {
    if (tick.t < 0 || tick.t > 1 || unique.has(tick.t)) continue;
    unique.set(tick.t, tick);
  }
  return [...unique.values()];
}

export function buildTimeline(hits: TimelineHit[], cap = TIMELINE_CAP): TimelineModel {
  const ranked = [...hits].sort((a, b) => {
    const as = stamp(a.created_at);
    const bs = stamp(b.created_at);
    if (as === null && bs === null) return a.id.localeCompare(b.id);
    if (as === null) return -1;
    if (bs === null) return 1;
    return as - bs || a.id.localeCompare(b.id);
  });
  const truncated = Math.max(0, ranked.length - cap);
  const kept = ranked.slice(-cap);
  const datedDays = [
    ...new Set(
      kept
        .map(hit => stamp(hit.created_at))
        .filter((ms): ms is number => ms !== null)
        .map(dayMsOf),
    ),
  ];
  const min = datedDays.length ? Math.min(...datedDays) : 0;
  const max = datedDays.length ? Math.max(...datedDays) : 0;
  const span = max - min || 1;
  const tLanes = new Map<number, number>();
  const nodes: TimelineNode[] = kept.map(hit => {
    const ms = stamp(hit.created_at);
    const undated = ms === null;
    const dayMs = ms === null ? null : dayMsOf(ms);
    const t = undated || datedDays.length === 0 ? 0 : ((dayMs ?? min) - min) / span;
    const lane = tLanes.get(t) ?? 0;
    tLanes.set(t, lane + 1);
    return {
      ...hit,
      t,
      lane,
      undated,
      dateLabel: dateLabel(ms),
    };
  });
  const spanLabel =
    datedDays.length === 0
      ? kept.length
        ? "Undated"
        : ""
      : `${yearLabel(min)} → ${yearLabel(max)}`;
  return {
    nodes,
    ticks: datedDays.length ? ticksFor(min, max) : [],
    truncated,
    total: hits.length,
    spanLabel,
  };
}
