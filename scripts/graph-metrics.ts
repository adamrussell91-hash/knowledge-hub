import { readFileSync } from "node:fs";
import { graphMetrics, formatGraphMetrics } from "../src/archive/graphMetrics";
import { buildShowAllGraph } from "../src/archive/showAllGraph";
import type { PageManifestEntry } from "../src/domain/page";

const path = process.argv[2] ?? "/agent/repos/knowledge-hub-data/manifest.json";
const raw = JSON.parse(readFileSync(path, "utf8")) as Array<Record<string, unknown>>;
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

const started = Date.now();
const model = buildShowAllGraph(entries, "tags");
const metrics = graphMetrics(model.nodes, model.links);
const elapsed = Date.now() - started;

console.log(JSON.stringify({ ...metrics, elapsedMs: elapsed, summary: formatGraphMetrics(metrics) }, null, 2));
