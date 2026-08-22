import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSchema, type Page, type PageManifestEntry } from "../src/domain/page";
import type { OriginKind } from "../src/domain/page";
import { stampPageOrigins } from "../src/origin/fromPlace";
import { originKey, pageOrigins } from "../src/origin/normalize";
import { extractNotionHex } from "../src/origin/notesPlace";
import { originsFromNotionPage } from "../src/origin/notion";
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

function manifestKeys(page: Page) {
  const keys = [page.id];
  if (page.source_notion_id) keys.push(page.source_notion_id);
  const hex = extractNotionHex(page.id) ?? extractNotionHex(page.source_notion_id);
  if (hex) keys.push(hex, `page_notion_${hex}`);
  return [...new Set(keys)];
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
  for (const id of limited) {
    try {
      pages.push(PageSchema.parse(JSON.parse(await readFile(path.join(pageDir, `${id}.json`), "utf8"))));
    } catch {
      console.error(`skip invalid page ${id}`);
    }
  }
  const changed = await stampOrigins({
    pages,
    fromNotion: parsed.fromNotion,
    token,
  });
  if (parsed.execute) {
    const manifest = await readJson<PageManifestEntry[]>(path.join(dataDir, "manifest.json"), []);
    const byId = new Map(manifest.map(entry => [entry.id, entry]));
    for (const page of changed) {
      await writeFile(path.join(pageDir, `${page.id}.json`), JSON.stringify(page, null, 2) + "\n");
      for (const key of manifestKeys(page)) {
        const current = byId.get(key);
        if (current) byId.set(key, { ...current, origins: page.origins });
      }
    }
    await writeFile(path.join(dataDir, "manifest.json"), JSON.stringify([...byId.values()], null, 2) + "\n");
  }
  const projected = pages.map(page => applyStampedOrigins(page) ?? page);
  console.log(
    JSON.stringify(
      {
        mode: parsed.execute ? "execute" : "dry-run",
        scanned: pages.length,
        stamped: changed.length,
        fromNotion: Boolean(parsed.fromNotion),
        pagesWith: originKindCounts(projected),
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
