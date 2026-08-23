import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSchema, type Page, type PageManifestEntry } from "../src/domain/page";
import type { OriginKind } from "../src/domain/page";
import { stampPageOrigins } from "../src/origin/fromPlace";
import { originKey, pageOrigins } from "../src/origin/normalize";
import { extractNotionHex } from "../src/origin/notesPlace";
import { originsFromNotionPage } from "../src/origin/notion";
import { excerptFromTidyBody } from "../src/tidy/run";
import { loadDotEnv } from "./loadLocalPages";

export type StampArgs = {
  dataDir?: string;
  id?: string;
  execute?: boolean;
  fromNotion?: boolean;
  count?: number;
};

export function parseStampArgs(args: string[]): StampArgs {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const countRaw = value("--count");
  const count = countRaw ? Number(countRaw) : undefined;
  if (countRaw && (!Number.isFinite(count) || count! < 1)) throw new Error("--count must be a positive number");
  return {
    ...(value("--data-dir") ? { dataDir: value("--data-dir") } : {}),
    ...(value("--id") ? { id: value("--id") } : {}),
    ...(args.includes("--execute") ? { execute: true } : {}),
    ...(args.includes("--from-notion") ? { fromNotion: true } : {}),
    ...(count ? { count } : {}),
  };
}

function originsChanged(page: Page, next: Page["origins"]) {
  const before = new Set(pageOrigins(page).map(originKey));
  const after = new Set(pageOrigins({ origins: next }).map(originKey));
  if (before.size !== after.size) return true;
  for (const key of after) if (!before.has(key)) return true;
  return false;
}

export function applyStampedOrigins(page: Page, extra: Page["origins"] = []) {
  const origins = stampPageOrigins(page, extra ?? []);
  if (!originsChanged(page, origins)) return null;
  return origins.length ? { ...page, origins } : { ...page, origins: undefined };
}

export function originKindCounts(pages: { origins?: Page["origins"] }[]) {
  const counts: Record<OriginKind, number> = { degree: 0, unit: 0, notebook: 0, book: 0, pd: 0 };
  for (const page of pages) {
    const kinds = new Set(pageOrigins(page).map(origin => origin.kind));
    for (const kind of kinds) counts[kind] += 1;
  }
  return counts;
}

export function notionIdKeys(value?: string) {
  const keys = new Set<string>();
  if (!value) return [];
  keys.add(value);
  const hex = extractNotionHex(value);
  if (hex) {
    keys.add(hex);
    keys.add(`page_notion_${hex}`);
    keys.add(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
  }
  return [...keys];
}

export function manifestKeys(page: Page, fileId?: string) {
  return [
    ...new Set([
      ...notionIdKeys(page.id),
      ...notionIdKeys(page.source_notion_id),
      ...notionIdKeys(page.source_notion_url),
      ...(fileId ? notionIdKeys(fileId) : []),
    ]),
  ];
}

type ManifestRow = PageManifestEntry & { path?: string };

/** Copy page-file fields onto every matching list row, even when the page itself did not change. */
export function syncManifestOrigins(
  manifest: ManifestRow[],
  pages: Page[],
  fileIds: string[] = [],
): PageManifestEntry[] {
  const pagesByKey = new Map<string, Page>();
  pages.forEach((page, index) => {
    for (const key of manifestKeys(page, fileIds[index])) pagesByKey.set(key, page);
  });
  return manifest.map(entry => {
    const pathId = entry.path?.replace(/^.*\//, "").replace(/\.json$/i, "");
    const page =
      pagesByKey.get(entry.id) ??
      (pathId ? pagesByKey.get(pathId) : undefined) ??
      notionIdKeys(entry.id)
        .map(key => pagesByKey.get(key))
        .find(Boolean);
    if (!page) return { ...entry };
    return {
      ...entry,
      title: page.title,
      tags: page.tags,
      excerpt: excerptFromTidyBody(page.body),
      ...(page.origins?.length ? { origins: page.origins } : {}),
      ...(page.source_notion_id ? { source_notion_id: page.source_notion_id } : {}),
    };
  });
}

const LIST_ORIGIN_KINDS = new Set<OriginKind>(["notebook", "book", "pd"]);

/** Page files recovered from Notion that never made it onto the live list. */
export function extraOriginEntries(manifest: ManifestRow[], pages: Page[]): ManifestRow[] {
  const listed = new Set(manifest.map(entry => entry.id));
  return pages
    .filter(
      page => !listed.has(page.id) && page.origins?.some(origin => LIST_ORIGIN_KINDS.has(origin.kind)),
    )
    .map(page => ({
      id: page.id,
      title: page.title,
      area: page.area,
      tags: page.tags,
      excerpt: excerptFromTidyBody(page.body),
      ...(page.origins?.length ? { origins: page.origins } : {}),
      ...(page.source_notion_id ? { source_notion_id: page.source_notion_id } : {}),
      ...(page.created_at ? { created_at: page.created_at } : {}),
      path: `pages/${page.id}.json`,
    }));
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function stampOrigins(input: {
  pages: Page[];
  fromNotion?: boolean;
  token?: string;
  fetchImpl?: typeof fetch;
}) {
  const changed: Page[] = [];
  for (const page of input.pages) {
    let extra: Page["origins"] = [];
    if (input.fromNotion && input.token && page.source_notion_id) {
      extra = (await originsFromNotionPage(page.source_notion_id, input.token, input.fetchImpl)) ?? [];
    }
    const next = applyStampedOrigins(page, extra);
    if (next) changed.push(next);
  }
  return changed;
}

async function main(args = process.argv.slice(2)) {
  const parsed = parseStampArgs(args);
  await loadDotEnv();
  const dataDir = parsed.dataDir ?? path.join(process.cwd(), "migrated", "data-repo");
  const token = process.env.NOTION_TOKEN;
  if (parsed.fromNotion && !token) throw new Error("NOTION_TOKEN is required for --from-notion");
  const pageDir = path.join(dataDir, "pages");
  const ids = parsed.id
    ? [parsed.id]
    : (await readdir(pageDir)).filter(file => file.endsWith(".json")).map(file => file.replace(/\.json$/, ""));
  const limited = parsed.count ? ids.slice(0, parsed.count) : ids;
  const pages: Page[] = [];
  const fileIds: string[] = [];
  for (const id of limited) {
    try {
      pages.push(PageSchema.parse(JSON.parse(await readFile(path.join(pageDir, `${id}.json`), "utf8"))));
      fileIds.push(id);
    } catch {
      console.error(`skip invalid page ${id}`);
    }
  }
  const changed = await stampOrigins({
    pages,
    fromNotion: parsed.fromNotion,
    token,
  });
  const projected = pages.map(page => applyStampedOrigins(page) ?? page);
  let listWith = originKindCounts(projected);
  if (parsed.execute) {
    const manifestPath = path.join(dataDir, "manifest.json");
    const manifest = await readJson<PageManifestEntry[]>(manifestPath, []);
    for (const page of changed) {
      await writeFile(path.join(pageDir, `${page.id}.json`), JSON.stringify(page, null, 2) + "\n");
    }
    const synced = syncManifestOrigins(manifest, projected, fileIds);
    const extra = extraOriginEntries(synced, projected);
    const nextManifest = [...synced, ...extra];
    listWith = originKindCounts(nextManifest);
    console.log(
      JSON.stringify({ appended: extra.length, listSize: nextManifest.length }, null, 2),
    );
    await writeFile(manifestPath, `${JSON.stringify(nextManifest)}\n`);
  }
  console.log(
    JSON.stringify(
      {
        mode: parsed.execute ? "execute" : "dry-run",
        scanned: pages.length,
        stamped: changed.length,
        fromNotion: Boolean(parsed.fromNotion),
        pagesWith: originKindCounts(projected),
        listWith,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
