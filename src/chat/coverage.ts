export type CoverageInput = {
  findings: Array<{ pageId: string }>;
  gaps: string[];
};

export type CoverageRead = {
  distinctSources: number;
  gapCount: number;
  thin: boolean;
};

export function coverageFromResearch(input: CoverageInput): CoverageRead {
  const distinctSources = new Set(input.findings.map(item => item.pageId)).size;
  const gapCount = input.gaps.length;
  return {
    distinctSources,
    gapCount,
    thin: distinctSources < 3 || gapCount > distinctSources,
  };
}
