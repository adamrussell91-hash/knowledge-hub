export type CoverageInput = {
  findings: Array<{
    pageId: string;
    sourceType?: string;
    method?: string;
    claimRelationship?: string;
  }>;
  gaps: string[];
};

export type CoverageRead = {
  distinctSources: number;
  gapCount: number;
  thin: boolean;
  sourceTypeKnown: number;
  methodKnown: number;
  mappedClaims: number;
};

export function coverageFromResearch(input: CoverageInput): CoverageRead {
  const distinctSources = new Set(input.findings.map(item => item.pageId)).size;
  const gapCount = input.gaps.length;
  const sourceTypeKnown = input.findings.filter(item => item.sourceType && item.sourceType !== "unknown").length;
  const methodKnown = input.findings.filter(item => Boolean(item.method?.trim())).length;
  const mappedClaims = input.findings.filter(item => item.claimRelationship === "direct" || item.claimRelationship === "indirect").length;
  return {
    distinctSources,
    gapCount,
    thin: distinctSources < 3 || gapCount > distinctSources,
    sourceTypeKnown,
    methodKnown,
    mappedClaims,
  };
}
