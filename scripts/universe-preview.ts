/**
 * Renders the Universe view's load layout to an SVG so the orbit pattern can be checked
 * without a browser. Usage: npx tsx scripts/universe-preview.ts [outFile]
 */
import fs from "node:fs";
import { SUN_RADIUS, buildUniverseGraph, type UniverseBody } from "../src/archive/universeGraph";

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

const entries = Array.from({ length: 900 }, (_, index) => {
  const tags = [MAJORS[index % MAJORS.length]!, MAJORS[(index + 3) % MAJORS.length]!];
  if (index % 3 === 0) tags.push(MINORS[index % MINORS.length]!);
  return { id: `p${index}`, title: `Note ${index}`, area: "notes" as const, tags, excerpt: "" };
});

const timeSec = Number(process.argv[3] ?? 0);
const model = buildUniverseGraph(entries);
const byId = new Map<string, UniverseBody & { x: number; y: number }>();
const placed: Array<UniverseBody & { x: number; y: number }> = [];
const order = ["sun", "planet", "minorPlanet", "moon", "moonet", "note"];
for (const kind of order) {
  for (const b of model.bodies.filter(item => item.kind === kind)) {
    const parent = b.parentId ? byId.get(b.parentId) : undefined;
    const origin = parent ?? { x: 0, y: 0 };
    const angle = b.phase + (b.periodSec === 0 ? 0 : (timeSec / b.periodSec) * Math.PI * 2);
    const point = {
      ...b,
      x: origin.x + Math.cos(angle) * b.orbitRadius,
      y: origin.y + Math.sin(angle) * b.orbitRadius,
    };
    byId.set(b.id, point);
    placed.push(point);
  }
}

const reach = Math.max(...placed.map(b => Math.hypot(b.x, b.y))) * 1.06;
const size = 1000;
const k = size / (reach * 2);
const px = (v: number) => (v * k + size / 2).toFixed(1);
const minScreen: Record<string, number> = {
  sun: 15,
  planet: 6,
  minorPlanet: 4,
  moon: 3.2,
  moonet: 2.4,
  note: 1.8,
};

const closest = Math.min(...placed.filter(b => b.kind !== "sun").map(b => Math.hypot(b.x, b.y)));
console.log(`bodies=${placed.length} reach=${Math.round(reach)} closest body to sun=${Math.round(closest)} sun r=${SUN_RADIUS}`);

const dots = placed
  .map(b => {
    const r = Math.max(b.r * k, minScreen[b.kind] ?? 2);
    const fill = b.kind === "sun" ? "#ffb347" : b.color;
    return `<circle cx="${px(b.x)}" cy="${px(b.y)}" r="${r.toFixed(1)}" fill="${fill}" opacity="${b.kind === "note" ? 0.8 : 1}" />`;
  })
  .join("\n");

const out = process.argv[2] ?? "/tmp/universe-preview.svg";
fs.writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fdf8ef" />\n${dots}\n</svg>`,
);
console.log(`wrote ${out}`);
