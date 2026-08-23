import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { topicKeywords } from "../src/archive/keywordGraph";
import { PageSchema, type Page, type PageManifestEntry } from "../src/domain/page";
import { syncManifestOrigins } from "./stamp-origins";

export type SyncArgs = { dataDir: string; execute?: boolean };

export function parseSyncManifestArgs(args: string[]): SyncArgs {
  const index = args.indexOf("--data-dir");
  const dataDir = index < 0 ? undefined : args[index + 1];
  if (!dataDir) throw new Error("--data-dir is required");
  return { dataDir, ...(args.includes("--execute") ? { execute: true } : {}) };
}

export function closedTopicCoverage(rows: Array<{ tags?: string[] }>) {
  const withClosedTopics = rows.filter(row => topicKeywords(row.tags ?? []).length > 0).length;
  return { total: rows.length, withClosedTopics, withoutClosedTopics: rows.length - withClosedTopics };
}

export function tagDrift(manifest: PageManifestEntry[], pages: Page[]) {
  const byId = new Map(pages.map(page => [page.id, page]));
  let pageAhead = 0;
  let listAhead = 0;
  let matched = 0;
  let missingPage = 0;
  for (const entry of manifest) {
    const page = byId.get(entry.id);
    if (!page) {
      missingPage += 1;
      continue;
    }
    const pageTopics = topicKeywords(page.tags).join("|");
    const listTopics = topicKeywords(entry.tags).join("|");
    if (pageTopics === listTopics) matched += 1;
    else if (pageTopics && !listTopics) pageAhead += 1;
    else listAhead += 1;
  }
  return { matched, pageAhead, listAhead, missingPage };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseSyncManifestArgs(args);
  const pageDir = path.join(parsed.dataDir, "pages");
  const manifestPath = path.join(parsed.dataDir, "manifest.json");
  const ids = (await readdir(pageDir)).filter(file => file.endsWith(".json")).map(file => file.replace(/\.json$/, ""));
  const pages: Page[] = [];
  const fileIds: string[] = [];
  for (const id of ids) {
    try {
      pages.push(PageSchema.parse(JSON.parse(await readFile(path.join(pageDir, `${id}.json`), "utf8"))));
      fileIds.push(id);
    } catch {
      console.error(`skip invalid page ${id}`);
    }
  }
  const manifest = await readJson<PageManifestEntry[]>(manifestPath, []);
  const next = syncManifestOrigins(manifest, pages, fileIds);
  const changed = next.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(manifest[index])).length;
  const report = {
    mode: parsed.execute ? "execute" : "dry-run",
    scannedPages: pages.length,
    listRows: manifest.length,
    changedRows: changed,
    pages: closedTopicCoverage(pages),
    listBefore: closedTopicCoverage(manifest),
    listAfter: closedTopicCoverage(next),
    drift: tagDrift(manifest, pages),
  };
  if (parsed.execute && changed) {
    await writeFile(manifestPath, `${JSON.stringify(next)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
