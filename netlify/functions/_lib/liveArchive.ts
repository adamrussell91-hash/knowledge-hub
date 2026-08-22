import { docsFromManifest, researchFromDocs } from "../../../src/research/liveArchive";
import type { ResearchResult } from "../../../src/research/schema";
import { createDataRepo, type ManifestFileEntry } from "./dataRepo";

const TTL_MS = 60_000;
let cache: { at: number; entries: ManifestFileEntry[] } | null = null;

export function resetLiveArchiveCache() {
  cache = null;
}

async function listManifest() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.entries;
  const entries = await createDataRepo().listManifest();
  cache = { at: Date.now(), entries };
  return entries;
}

export async function pullLiveArchive(input: { query: string; k: number; tags?: string[] }): Promise<ResearchResult> {
  return researchFromDocs({
    query: input.query,
    docs: docsFromManifest(await listManifest(), input.tags),
    k: input.k,
  });
}
