import { RESEARCH_INDEX_META_KEY, RESEARCH_MANIFEST_KEY, RESEARCH_VECTORS_KEY } from "../research/corpusCache";
import { unpackVectorIndex } from "../research/vectorPack";
import type { CorpusEntry } from "./run";

export type ResearchPack = {
  meta: { pageId: string; title: string }[];
  bytes: ArrayBuffer | Uint8Array;
  manifest: { id?: string; pageId?: string; excerpt?: string }[];
};

export type ResearchPackLoader = {
  text: (key: string) => Promise<string | null>;
  bytes: (key: string) => Promise<ArrayBuffer | Uint8Array | null>;
};

export function corpusFromResearchPack(pack: ResearchPack): CorpusEntry[] {
  const unpacked = unpackVectorIndex(pack.meta, pack.bytes);
  const excerpts = new Map(
    pack.manifest.map(row => [row.id ?? row.pageId ?? "", row.excerpt ?? ""] as const),
  );
  return unpacked.map(entry => ({
    pageId: entry.pageId,
    title: entry.title,
    excerpt: excerpts.get(entry.pageId) ?? "",
    vector: entry.vector,
  }));
}

export async function loadResearchPack(loader: ResearchPackLoader): Promise<ResearchPack> {
  const [metaRaw, manifestRaw, vectorBytes] = await Promise.all([
    loader.text(RESEARCH_INDEX_META_KEY),
    loader.text(RESEARCH_MANIFEST_KEY),
    loader.bytes(RESEARCH_VECTORS_KEY),
  ]);
  if (!metaRaw || !manifestRaw || !vectorBytes) {
    throw new Error("Research corpus missing from R2 (research/vectors.bin, research/index-meta.json, research/manifest.json)");
  }
  return {
    meta: JSON.parse(metaRaw) as { pageId: string; title: string }[],
    bytes: vectorBytes,
    manifest: JSON.parse(manifestRaw) as ResearchPack["manifest"],
  };
}
