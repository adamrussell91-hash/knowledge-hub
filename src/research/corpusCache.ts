import type { LexicalDoc } from "../lib/lexicalRetrieve";
import type { VectorDoc } from "./hybridRetrieve";
import { unpackVectorIndex } from "./vectorPack";

export const RESEARCH_VECTORS_KEY = "research/vectors.bin";
export const RESEARCH_INDEX_META_KEY = "research/index-meta.json";
export const RESEARCH_MANIFEST_KEY = "research/manifest.json";

export type ResearchCorpus = {
  index: VectorDoc[];
  manifest: LexicalDoc[];
};

export type CorpusLoader = {
  text: (key: string) => Promise<string | null>;
  bytes: (key: string) => Promise<ArrayBuffer | null>;
};

type ManifestRow = LexicalDoc & { path?: string; pageId?: string };

let cache: ResearchCorpus | null = null;

export function resetCorpusCache() {
  cache = null;
}

export async function loadCorpusCached(loader: CorpusLoader): Promise<ResearchCorpus> {
  if (cache) return cache;
  const [metaRaw, manifestRaw, vectorBytes] = await Promise.all([
    loader.text(RESEARCH_INDEX_META_KEY),
    loader.text(RESEARCH_MANIFEST_KEY),
    loader.bytes(RESEARCH_VECTORS_KEY),
  ]);
  if (!metaRaw || !manifestRaw || !vectorBytes) {
    throw new Error("Research corpus missing from R2 (research/vectors.bin, research/index-meta.json, research/manifest.json)");
  }
  const meta = JSON.parse(metaRaw) as { pageId: string; title: string }[];
  const rows = JSON.parse(manifestRaw) as ManifestRow[];
  cache = {
    index: unpackVectorIndex(meta, vectorBytes),
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
