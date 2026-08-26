const PAGE_HASH = /^#page\/([^#/?\s]+)$/;

export function pageIdFromHash(hash: string): string | null {
  const match = PAGE_HASH.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function pageHashForId(pageId: string): string {
  return `#page/${encodeURIComponent(pageId)}`;
}

export function isPageHash(hash: string): boolean {
  return pageIdFromHash(hash) !== null;
}

const VISUALISER_HASH = /^#visualiser(?:\/([^#/?\s]+))?$/;

export function isVisualiserHash(hash: string): boolean {
  return VISUALISER_HASH.test(hash);
}

export function visualiserIdeaFromHash(hash: string): string | null {
  const match = VISUALISER_HASH.exec(hash);
  return match?.[1] ?? null;
}

export function visualiserHashForIdea(idea?: string): string {
  return idea ? `#visualiser/${encodeURIComponent(idea)}` : "#visualiser";
}
