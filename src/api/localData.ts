import type { Page, PageManifestEntry } from "../domain/page";
import { PageManifestEntrySchema, PageSchema } from "../domain/page";
import { z } from "zod";

const ManifestSchema = z.array(PageManifestEntrySchema);

let cache: PageManifestEntry[] | null = null;
const pageCache = new Map<string, Page>();

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Local data error ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export function normalizeManifestRow(entry: Record<string, unknown>) {
  return {
    id: entry.id,
    title: entry.title,
    area: entry.area,
    tags: entry.tags ?? [],
    excerpt: entry.excerpt ?? "",
    ...(typeof entry.created_at === "string" ? { created_at: entry.created_at } : {}),
  };
}

export async function localListPages(): Promise<PageManifestEntry[]> {
  if (cache) return cache;
  const raw = await readJson<unknown>("/local-data/manifest.json");
  // Manifest entries from migrate may include `path` — strip before parse
  const normalized = (Array.isArray(raw) ? raw : []).map(entry =>
    normalizeManifestRow(entry as Record<string, unknown>),
  );
  cache = ManifestSchema.parse(normalized);
  return cache;
}

export async function localGetPage(id: string): Promise<Page> {
  const hit = pageCache.get(id);
  if (hit) return hit;
  const raw = await readJson<unknown>(`/local-data/pages/${encodeURIComponent(id)}.json`);
  const page = PageSchema.parse(raw);
  pageCache.set(id, page);
  return page;
}

export async function localSearchPages(query: string): Promise<PageManifestEntry[]> {
  const needle = query.trim().toLowerCase();
  const entries = await localListPages();
  if (!needle) return entries;
  return entries.filter(entry =>
    [entry.title, entry.excerpt, entry.area, ...entry.tags].join(" ").toLowerCase().includes(needle),
  );
}
