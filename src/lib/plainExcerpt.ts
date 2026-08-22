/** Turn markdown-ish note text into a single readable preview line. */
export function stripMarkdownForExcerpt(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/\s+[-*+]\s+/g, " ")
    .trim();
}

export function plainExcerpt(text: string, maxLen = 300): string {
  return stripMarkdownForExcerpt(text).slice(0, maxLen);
}
