/**
 * Renders the Universe view's load layout to an SVG so the orbit pattern can be checked
 * without a browser. Usage: npx tsx scripts/universe-preview.ts [outFile]
 */
import fs from "node:fs";
import { SUN_RADIUS, buildSolarModel } from "../src/archive/solarModel";
import { TOPIC_VOCABULARY } from "../src/tidy/vocabulary";

const TAGS = [...TOPIC_VOCABULARY];

const entries = Array.from({ length: 900 }, (_, index) => {
  const tags = [TAGS[index % TAGS.length]!, TAGS[(index + 3) % TAGS.length]!, TAGS[(index + 7) % TAGS.length]!];
  return { id: `p${index}`, title: `Note ${index}`, area: "notes" as const, tags, excerpt: "" };
});

const timeSec = Number(process.argv[3] ?? 0);
const model = buildSolarModel(entries);
const x = new Float64Array(model.bodies.length);
const y = new Float64Array(model.bodies.length);
for (const b of model.bodies) {
  if (b.parent < 0) continue;
  const ang = b.phase + (b.period ? (timeSec / b.period) * Math.PI * 2 : 0);
  x[b.idx] = x[b.parent] + Math.cos(ang) * b.a;
  y[b.idx] = y[b.parent] + Math.sin(ang) * b.a;
}

const pages = model.bodies.filter(b => b.kind === "page" || b.kind === "rock");
const reach = model.reach * 1.06;
const size = 1000;
const k = size / (reach * 2);
const px = (v: number) => (v * k + size / 2).toFixed(1);

const closest = Math.min(
  ...model.bodies.filter(b => b.kind !== "sun").map(b => Math.hypot(x[b.idx]!, y[b.idx]!)),
);
console.log(
  `bodies=${model.bodies.length} pages+rocks=${pages.length} reach=${Math.round(model.reach)} closest=${Math.round(closest)} sun r=${SUN_RADIUS}`,
);

const dots = model.bodies
  .map(b => {
    const r = Math.max(b.r * k, b.kind === "page" || b.kind === "rock" ? 0.6 : 2);
    return `<circle cx="${px(x[b.idx]!)}" cy="${px(y[b.idx]!)}" r="${r.toFixed(1)}" fill="${b.color}" opacity="${b.kind === "page" ? 0.8 : 1}" />`;
  })
  .join("\n");

const out = process.argv[2] ?? "/tmp/universe-preview.svg";
fs.writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fdf8ef" />\n${dots}\n</svg>`,
);
console.log(`wrote ${out}`);
