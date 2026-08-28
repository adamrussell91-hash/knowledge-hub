/**
 * Settle the Show All tags graph and write an SVG so the connected mass can be
 * checked without a browser. Usage: npx tsx scripts/show-all-preview.ts [manifest] [outFile]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildShowAllGraph } from "../src/archive/showAllGraph";
import { createShowAllSimulation, lockShowAllNodes, SHOW_ALL_SETTLE_TICKS } from "../src/archive/showAllSimulation";
import { graphMetrics, formatGraphMetrics } from "../src/archive/graphMetrics";
import type { PageManifestEntry } from "../src/domain/page";

const manifestPath = process.argv[2] ?? "/agent/repos/knowledge-hub-data/manifest.json";
const out = process.argv[3] ?? "/tmp/show-all-preview.svg";
const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Array<Record<string, unknown>>;
const entries = raw.map(
  entry =>
    ({
      id: String(entry.id),
      title: String(entry.title ?? ""),
      area: entry.area === "university" ? "university" : "notes",
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      excerpt: String(entry.excerpt ?? ""),
      origins: Array.isArray(entry.origins) ? entry.origins : undefined,
    }) satisfies PageManifestEntry,
);

const builtAt = Date.now();
const model = buildShowAllGraph(entries, "tags");
const metrics = graphMetrics(model.nodes, model.links);
console.log(`build ${Date.now() - builtAt}ms · ${formatGraphMetrics(metrics)}`);

const simAt = Date.now();
const simulation = createShowAllSimulation(model.nodes, model.links).stop();
simulation.tick(SHOW_ALL_SETTLE_TICKS);
lockShowAllNodes(model.nodes);
console.log(`settle ${Date.now() - simAt}ms · ${SHOW_ALL_SETTLE_TICKS} ticks`);

const xs = model.nodes.map(node => node.x ?? 0);
const ys = model.nodes.map(node => node.y ?? 0);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const pad = 48;
const size = 1400;
const span = Math.max(maxX - minX, maxY - minY, 1);
const k = (size - pad * 2) / span;
const px = (x: number) => pad + (x - minX) * k;
const py = (y: number) => pad + (y - minY) * k;

const byId = new Map(model.nodes.map(node => [node.id, node]));
const edges = model.links
  .map(link => {
    const source = byId.get(typeof link.source === "string" ? link.source : link.source.id);
    const target = byId.get(typeof link.target === "string" ? link.target : link.target.id);
    if (!source || !target) return "";
    return `<path d="M${px(source.x ?? 0).toFixed(1)},${py(source.y ?? 0).toFixed(1)} L${px(target.x ?? 0).toFixed(1)},${py(target.y ?? 0).toFixed(1)}" stroke="${source.soft}" stroke-opacity="0.16" stroke-width="0.6" fill="none" />`;
  })
  .join("\n");

const dots = model.nodes
  .map(node => {
    const r = Math.max(1.1, (node.r ?? 4) * 0.55);
    return `<circle cx="${px(node.x ?? 0).toFixed(1)}" cy="${py(node.y ?? 0).toFixed(1)}" r="${r.toFixed(2)}" fill="${node.color}" />`;
  })
  .join("\n");

writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fbf8f2" />\n${edges}\n${dots}\n</svg>`,
);
console.log(`wrote ${out}`);
