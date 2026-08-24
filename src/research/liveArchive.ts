import { lexicalRetrieve, type LexicalDoc } from "../lib/lexicalRetrieve";
import type { ResearchResult } from "./schema";
import { topicQuery } from "./topicQuery";

export type LiveArchiveDoc = LexicalDoc & { sourceUrl?: string };

export function researchFromDocs(input: {
  query: string;
  docs: LiveArchiveDoc[];
  k?: number;
}): ResearchResult {
  const query = topicQuery(input.query) || input.query.trim();
  const hits = lexicalRetrieve(input.docs, query, input.k ?? 16);
  const byId = new Map(input.docs.map(doc => [doc.id, doc]));
  return {
    query,
    round: 1,
    status: "done",
    findings: hits.map(hit => ({
      pageId: hit.id,
      title: hit.title,
      sourceUrl: byId.get(hit.id)?.sourceUrl ?? "",
      excerpt: hit.excerpt,
      stance: "related",
      analysis: "Live archive match — cite this page; do not invent another.",
      tags: byId.get(hit.id)?.tags,
    })),
    gaps: hits.length ? [] : [`Nothing in the live archive matched “${query}”.`],
    followUpQueries: [],
  };
}

export function docsFromManifest(
  entries: Array<{
    id: string;
    title: string;
    excerpt: string;
    tags?: string[];
    area?: string;
  }>,
  tags?: string[],
): LiveArchiveDoc[] {
  return entries
    .filter(entry => !tags?.length || tags.every(tag => (entry.tags ?? []).includes(tag)))
    .map(entry => ({
      id: entry.id,
      title: entry.title,
      excerpt: entry.excerpt,
      tags: entry.tags,
      area: entry.area,
    }));
}
