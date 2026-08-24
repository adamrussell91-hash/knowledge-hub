import type { ClaimRelationship, Confidence, ResearchFinding } from "./schema";

const MISSING = "Not available from the current database export.";

export function filled(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

export function themeConfidence(input: { direct: number; empirical: number; theoretical: number }): Confidence {
  if (input.direct >= 2 || (input.theoretical >= 1 && input.empirical >= 1)) return "high";
  if (input.direct >= 1) return "medium";
  return "low";
}

export function metadataGaps(finding: Pick<ResearchFinding, "sourceType" | "method" | "population" | "keyFinding">) {
  return {
    sourceType: !finding.sourceType || finding.sourceType === "unknown",
    method: !filled(finding.method),
    population: !filled(finding.population),
    keyFinding: !filled(finding.keyFinding),
  };
}

export function evidenceFields(finding: ResearchFinding) {
  const gaps = metadataGaps(finding);
  return {
    sourceType: finding.sourceType && finding.sourceType !== "unknown" ? finding.sourceType : MISSING,
    method: filled(finding.method) ? finding.method.trim() : MISSING,
    population: filled(finding.population) ? finding.population.trim() : MISSING,
    keyFinding: filled(finding.keyFinding) ? finding.keyFinding.trim() : MISSING,
    claimRelationship: finding.claimRelationship ?? ("interpretive" as ClaimRelationship),
    confidence: finding.confidence,
    limitation: filled(finding.limitation) ? finding.limitation.trim() : MISSING,
    missingCount: Object.values(gaps).filter(Boolean).length,
  };
}

export function formatEvidencePacket(finding: ResearchFinding) {
  const packet = evidenceFields(finding);
  const tags = finding.tags?.length ? finding.tags.join("; ") : MISSING;
  return [
    `type: ${packet.sourceType}`,
    `method: ${packet.method}`,
    `population: ${packet.population}`,
    `key finding: ${packet.keyFinding}`,
    `claim relationship: ${packet.claimRelationship}`,
    packet.confidence ? `confidence: ${packet.confidence}` : "",
    `limitation: ${packet.limitation}`,
    `tags: ${tags}`,
  ]
    .filter(Boolean)
    .join(" | ");
}
