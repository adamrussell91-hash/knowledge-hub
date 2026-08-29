import { readFileSync } from "node:fs";
import { nodeDegrees, noteToNoteLinks } from "../src/archive/graphMetrics";
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
const leaves = model.nodes.filter(node => node.kind === "leaf");
const hubs = model.nodes.filter(node => node.kind === "major");
const noteLinks = noteToNoteLinks(model.links);
const degrees = [...nodeDegrees(leaves, noteLinks).values()];
const elapsed = Date.now() - started;

console.log(
  JSON.stringify(
    {
      hubs: hubs.length,
      notes: leaves.length,
      noteLinks: noteLinks.length,
      spokes: model.links.filter(link => link.kind === "spoke").length,
      maxNoteDegree: degrees.length ? Math.max(...degrees) : 0,
      meanNoteDegree: degrees.length ? degrees.reduce((sum, value) => sum + value, 0) / degrees.length : 0,
      elapsedMs: elapsed,
    },
    null,
    2,
  ),
);
