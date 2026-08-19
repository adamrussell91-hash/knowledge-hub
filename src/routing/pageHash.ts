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
