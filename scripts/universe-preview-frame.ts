/**
 * One-planet close-up of the rebuilt solar model. Usage: npx tsx scripts/universe-preview-frame.ts
 */
import fs from "node:fs";
import { buildSolarModel, worldPositions, type Body } from "../src/archive/solarModel";
import { TOPIC_VOCABULARY } from "../src/tidy/vocabulary";

const TAGS = [...TOPIC_VOCABULARY];

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const entries = Array.from({ length: 900 }, (_, index) => {
  const tags = [TAGS[index % TAGS.length]!, TAGS[(index + 3) % TAGS.length]!, TAGS[(index + 7) % TAGS.length]!];
  return { id: `p${index}`, title: `Note ${index}`, area: "notes" as const, tags, excerpt: "" };
});

const model = buildSolarModel(entries);
const { x, y } = worldPositions(model.bodies, 0);

function subtree(planet: Body) {
  return model.bodies.filter(b => {
    let node: Body | undefined = b;
    while (node && node.parent >= 0) {
      if (node.parent === planet.idx) return true;
      node = model.bodies[node.parent];
    }
    return false;
  });
}

const planet = [...model.planets]
  .map(p => ({ planet: p, kids: subtree(p) }))
  .sort((a, b) => b.kids.length - a.kids.length)[0]!;

const panel = 900;
const pad = 80;
const reach = Math.max(planet.planet.sysR, 1);
const k = (panel / 2 - pad) / reach;

const cx = panel / 2;
const cy = panel / 2;
const px = (wx: number) => cx + (wx - x[planet.planet.idx]!) * k;
const py = (wy: number) => cy + (wy - y[planet.planet.idx]!) * k;

const parts: string[] = [
  `<rect width="${panel}" height="${panel}" fill="#f7f4ee" />`,
  `<text x="24" y="36" font-family="Inter, ui-sans-serif" font-size="18" fill="#3d4a55">${esc(planet.planet.label)}</text>`,
  `<text x="24" y="58" font-family="Inter, ui-sans-serif" font-size="12" fill="#6b7780">${esc(`${planet.kids.length} bodies · sysR ${planet.planet.sysR.toFixed(1)}`)}</text>`,
];

for (const b of planet.kids) {
  const r = Math.max(b.r * k, b.kind === "page" ? 0.7 : 2);
  parts.push(
    `<circle cx="${px(x[b.idx]!).toFixed(1)}" cy="${py(y[b.idx]!).toFixed(1)}" r="${r.toFixed(2)}" fill="${b.color}" fill-opacity="0.9" />`,
  );
}
parts.push(
  `<circle cx="${cx}" cy="${cy}" r="${Math.max(planet.planet.r * k, 6).toFixed(2)}" fill="${planet.planet.color}" />`,
);

const out = "/tmp/universe-planet-preview.svg";
fs.writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${panel}" height="${panel}" viewBox="0 0 ${panel} ${panel}">${parts.join("\n")}</svg>`,
);
console.log(JSON.stringify({ planet: planet.planet.label, kids: planet.kids.length, pages: planet.kids.filter(b => b.kind === "page").length, out }, null, 2));
