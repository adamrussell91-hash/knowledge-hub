/**
 * One-planet preview at a fixed camera (same zoom as the user's screenshot),
 * 1x vs current 5x spacing. Usage: npx tsx scripts/universe-preview-frame.ts
 */
import fs from "node:fs";
import { buildUniverseGraph, type UniverseBody, type UniverseBodyKind } from "../src/archive/universeGraph";

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

const MIN_SCREEN_R: Record<UniverseBodyKind, number> = {
  sun: 15,
  planet: 6,
  asteroid: 1.4,
  minorPlanet: 4,
  moon: 3.2,
  moonet: 2.4,
  note: 3.6,
};

function visualR(kind: UniverseBodyKind, worldR: number, k: number) {
  return Math.max(worldR, (MIN_SCREEN_R[kind] ?? 2) / k);
}

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const entries = Array.from({ length: 900 }, (_, index) => {
  const tags = [MAJORS[index % MAJORS.length]!, MAJORS[(index + 3) % MAJORS.length]!];
  if (index % 3 === 0) tags.push(MINORS[index % MINORS.length]!);
  return { id: `p${index}`, title: `Note ${index}`, area: "notes" as const, tags, excerpt: "" };
});

const model = buildUniverseGraph(entries);
const byId = new Map<string, UniverseBody & { x: number; y: number }>();
const placed: Array<UniverseBody & { x: number; y: number }> = [];
const order: UniverseBodyKind[] = ["sun", "planet", "asteroid", "minorPlanet", "moon", "moonet", "note"];
for (const kind of order) {
  for (const b of model.bodies.filter(item => item.kind === kind)) {
    const parent = b.parentId ? byId.get(b.parentId) : undefined;
    const origin = parent ?? { x: 0, y: 0 };
    const point = {
      ...b,
      x: origin.x + Math.cos(b.phase) * b.orbitRadius,
      y: origin.y + Math.sin(b.phase) * b.orbitRadius,
    };
    byId.set(b.id, point);
    placed.push(point);
  }
}

const planets = placed.filter(b => b.kind === "planet");
const planet = planets
  .map(p => ({
    planet: p,
    kids: placed.filter(b => {
      let node: (UniverseBody & { x: number; y: number }) | undefined = b;
      while (node?.parentId) {
        if (node.parentId === p.id) return true;
        node = byId.get(node.parentId);
      }
      return false;
    }),
  }))
  .sort((a, b) => b.kids.length - a.kids.length)[0]!;

function clusterReach(kids: typeof planet.kids) {
  return Math.max(
    planet.planet.r,
    ...kids.map(b => Math.hypot(b.x - planet.planet.x, b.y - planet.planet.y)),
  );
}

const reach5 = clusterReach(planet.kids);
const reach1 = reach5 / 5;
const panel = 900;
const pad = 80;
const kShot = ((panel / 2 - pad) * 0.38) / reach1;

function panelSvg(
  label: string,
  scaleFromPlanet: number,
  k: number,
): string {
  const cx = panel / 2;
  const cy = panel / 2;
  const px = (x: number) => cx + (x - planet.planet.x) * scaleFromPlanet * k;
  const py = (y: number) => cy + (y - planet.planet.y) * scaleFromPlanet * k;
  const parts: string[] = [
    `<rect width="${panel}" height="${panel}" fill="#f7f4ee" />`,
    `<text x="24" y="36" font-family="Inter, ui-sans-serif" font-size="18" fill="#3d4a55">${label}</text>`,
    `<text x="24" y="58" font-family="Inter, ui-sans-serif" font-size="12" fill="#6b7780">${esc(`zoom k=${k.toFixed(4)} · ${planet.kids.length} bodies · ${planet.planet.label}`)}</text>`,
  ];
  for (const b of planet.kids) {
    if (b.kind !== "note" && b.kind !== "asteroid") continue;
    const r = visualR(b.kind, b.r, k) * k;
    parts.push(
      `<circle cx="${px(b.x).toFixed(1)}" cy="${py(b.y).toFixed(1)}" r="${Math.max(r, 0.6).toFixed(2)}" fill="${b.color}" fill-opacity="0.85" stroke="#fff" stroke-width="0.6" />`,
    );
  }
  for (const b of planet.kids) {
    if (b.kind !== "minorPlanet") continue;
    const r = visualR(b.kind, b.r, k) * k;
    parts.push(
      `<circle cx="${px(b.x).toFixed(1)}" cy="${py(b.y).toFixed(1)}" r="${r.toFixed(2)}" fill="${b.color}" stroke="#fff" stroke-width="1" />`,
    );
  }
  const pr = visualR("planet", planet.planet.r, k) * k;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${pr.toFixed(2)}" fill="${planet.planet.color}" stroke="#fff" stroke-width="1.4" />`,
  );
  return parts.join("\n");
}

const left = panelSvg("BEFORE · 1x spacing (your screenshot)", 0.2, kShot);
const rightSameZoom = panelSvg("AFTER · 5x spacing, same zoom as screenshot", 1, kShot);
const kFit = ((panel / 2 - pad) * 0.38) / reach5;
const rightFit = panelSvg("AFTER · 5x, zoomed out to same cluster size on screen", 1, kFit);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${panel * 3}" height="${panel}" viewBox="0 0 ${panel * 3} ${panel}">
<g>${left}</g>
<g transform="translate(${panel},0)">${rightSameZoom}</g>
<g transform="translate(${panel * 2},0)">${rightFit}</g>
</svg>`;

const out = "/tmp/universe-planet-preview.svg";
fs.writeFileSync(out, svg);
console.log(
  JSON.stringify(
    {
      planet: planet.planet.label,
      kids: planet.kids.length,
      notes: planet.kids.filter(b => b.kind === "note").length,
      reach1: Math.round(reach1),
      reach5: Math.round(reach5),
      kShot,
      kFit,
      out,
    },
    null,
    2,
  ),
);
