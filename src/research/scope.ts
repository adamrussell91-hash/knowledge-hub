import type { LexicalDoc } from "../lib/lexicalRetrieve";

export type ResearchScope = {
  area?: "university" | "notes";
  tags?: string[];
};

export function parseResearchScope(raw: unknown): ResearchScope | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as { area?: unknown; tags?: unknown };
  const area = value.area === "university" || value.area === "notes" ? value.area : undefined;
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === "string").map(tag => tag.trim()).filter(Boolean)
    : [];
  if (!area && !tags.length) return undefined;
  return { ...(area ? { area } : {}), ...(tags.length ? { tags } : {}) };
}

export function applyResearchScope<T extends { pageId: string }>(
  manifest: LexicalDoc[],
  index: T[],
  scope?: ResearchScope,
): { manifest: LexicalDoc[]; index: T[] } {
  if (!scope?.area && !scope?.tags?.length) return { manifest, index };
  const nextManifest = manifest.filter(doc => {
    if (scope.area && doc.area !== scope.area) return false;
    if (scope.tags?.length) {
      const tags = doc.tags ?? [];
      if (!scope.tags.every(tag => tags.includes(tag))) return false;
    }
    return true;
  });
  const allowed = new Set(nextManifest.map(doc => doc.id));
  return { manifest: nextManifest, index: index.filter(entry => allowed.has(entry.pageId)) };
}
