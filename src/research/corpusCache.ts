import type { LexicalDoc } from "../lib/lexicalRetrieve";
import type { VectorDoc } from "./hybridRetrieve";

export const RESEARCH_INDEX_KEY = "research/index.json";
export const RESEARCH_MANIFEST_KEY = "research/manifest.json";

export type ResearchCorpus = {
  index: VectorDoc[];
  manifest: LexicalDoc[];
};

type ManifestRow = LexicalDoc & { path?: string; pageId?: string };

let cache: ResearchCorpus | null = null;

export function resetCorpusCache() {
  cache = null;
}

export async function loadCorpusCached(getObject: (key: string) => Promise<string | null>): Promise<ResearchCorpus> {
  if (cache) return cache;
  const [indexRaw, manifestRaw] = await Promise.all([
    getObject(RESEARCH_INDEX_KEY),
    getObject(RESEARCH_MANIFEST_KEY),
  ]);
  if (!indexRaw || !manifestRaw) {
    throw new Error("Research corpus missing from R2 (research/index.json and research/manifest.json)");
  }
  const index = JSON.parse(indexRaw) as VectorDoc[];
  const rows = JSON.parse(manifestRaw) as ManifestRow[];
  cache = {
    index: index.map(entry => ({ pageId: entry.pageId, title: entry.title, vector: entry.vector })),
    manifest: rows.map(row => ({
      id: row.id ?? row.pageId ?? "",
      title: row.title,
      excerpt: row.excerpt,
      tags: row.tags,
      area: row.area,
    })),
  };
  return cache;
}
