import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSchema, type Page, type PageManifestEntry } from "../src/domain/page";
import { stampPageOrigins } from "../src/origin/fromPlace";
import { originKey, pageOrigins } from "../src/origin/normalize";
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
  if (!origins.length || !originsChanged(page, origins)) return null;
  return { ...page, origins };
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
      const current = byId.get(page.id);
      if (current) byId.set(page.id, { ...current, origins: page.origins });
    }
    await writeFile(path.join(dataDir, "manifest.json"), JSON.stringify([...byId.values()], null, 2) + "\n");
  }
  console.log(
    JSON.stringify(
      {
        mode: parsed.execute ? "execute" : "dry-run",
        scanned: pages.length,
        stamped: changed.length,
        fromNotion: Boolean(parsed.fromNotion),
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
