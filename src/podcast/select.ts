import type { ResearchScope } from "../research/scope";
import type { PodcastMode } from "./schema";

export type TagMatch = "all" | "any";

export function selectQuery(input: {
  mode: PodcastMode;
  scope?: ResearchScope;
  modeDial: Record<string, string>;
  topic?: string;
}) {
  if (input.topic?.trim()) return input.topic.trim();
  if (input.mode === "connector") return `${input.modeDial.clusterA ?? ""} ${input.modeDial.clusterB ?? ""}`.trim();
  if (input.mode === "debate") return `${input.modeDial.positionA ?? ""} ${input.modeDial.positionB ?? ""}`.trim();
  const tags = input.scope?.tags?.join(" ") ?? "";
  if (input.mode === "recap") return `what is new in ${tags || "the archive"}`;
  return tags || "hub notes";
}

export function connectorScope(clusters: [string, string]): ResearchScope & { tagMatch: TagMatch } {
  return { tags: [clusters[0], clusters[1]], tagMatch: "any" };
}

const CADENCE_MS = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  "half-yearly": 182 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

export function recapCutoff(input: {
  cadence: keyof typeof CADENCE_MS;
  lastRecapAt?: string;
  now: number;
}) {
  const windowStart = input.now - CADENCE_MS[input.cadence];
  const last = input.lastRecapAt ? Date.parse(input.lastRecapAt) : 0;
  return Math.max(windowStart, last || windowStart);
}

export function filterByUpdatedAt<T extends { updated_at: string }>(pages: T[], cutoffMs: number) {
  return pages.filter(page => Date.parse(page.updated_at) >= cutoffMs);
}

export function applyPodcastScope<T extends { id: string; area?: string; tags?: string[] }>(
  docs: T[],
  scope?: ResearchScope & { tagMatch?: TagMatch },
): T[] {
  if (!scope?.area && !scope?.tags?.length) return docs;
  return docs.filter(doc => {
    if (scope.area && doc.area !== scope.area) return false;
    if (!scope.tags?.length) return true;
    const tags = doc.tags ?? [];
    if (scope.tagMatch === "any") return scope.tags.some(tag => tags.includes(tag));
    return scope.tags.every(tag => tags.includes(tag));
  });
}
