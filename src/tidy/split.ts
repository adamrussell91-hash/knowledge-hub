import { newHubPageId, type Page } from "../domain/page";

/** Stay under tidy `max_tokens: 4000` so a full-body rewrite can still return valid JSON. */
export const TIDY_SPLIT_MAX_CHARS = 8000;

export function splitMarkdown(body: string, maxChars = TIDY_SPLIT_MAX_CHARS): string[] {
  const text = body.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const at = pickSplitIndex(text);
  if (at <= 0 || at >= text.length) {
    return hardSplit(text, maxChars).flatMap(part => splitMarkdown(part, maxChars));
  }
  return [...splitMarkdown(text.slice(0, at).trim(), maxChars), ...splitMarkdown(text.slice(at).trim(), maxChars)];
}

function pickSplitIndex(text: string) {
  const windowStart = Math.max(1, Math.floor(text.length * 0.2));
  const windowEnd = Math.min(text.length - 1, Math.ceil(text.length * 0.8));
  const mid = Math.floor(text.length / 2);
  const candidates: number[] = [];
  for (const match of text.matchAll(/(?:\n)(#{1,6} )/g)) {
    const index = match.index ?? -1;
    if (index > windowStart && index < windowEnd) candidates.push(index + 1);
  }
  for (const match of text.matchAll(/\n\n+/g)) {
    const index = (match.index ?? -1) + match[0].length;
    if (index > windowStart && index < windowEnd) candidates.push(index);
  }
  if (!candidates.length) {
    for (const match of text.matchAll(/[.!?]["']?\s+/g)) {
      const index = (match.index ?? -1) + match[0].length;
      if (index > windowStart && index < windowEnd) candidates.push(index);
    }
  }
  if (!candidates.length) return -1;
  return candidates.reduce((best, index) => (Math.abs(index - mid) < Math.abs(best - mid) ? index : best));
}

function hardSplit(text: string, maxChars: number) {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const space = window.lastIndexOf(" ");
    const cut = space > maxChars * 0.5 ? space : maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function partTitle(title: string, index: number, total: number) {
  return total <= 1 ? title : `${title} (${index + 1}/${total})`;
}

export function splitLeftoverPage(
  page: Page,
  now: string,
  newId: () => string = newHubPageId,
  maxChars = TIDY_SPLIT_MAX_CHARS,
): { kept: Page; created: Page[] } {
  const chunks = splitMarkdown(page.body, maxChars);
  if (chunks.length <= 1) return { kept: page, created: [] };
  const createdIds = chunks.slice(1).map(() => newId());
  const family = [page.id, ...createdIds];
  const created = chunks.slice(1).map((body, offset) => {
    const id = createdIds[offset]!;
    const { source_notion_id: _notionId, source_notion_url: _notionUrl, source: _source, ...rest } = page;
    return {
      ...rest,
      id,
      title: partTitle(page.title, offset + 1, chunks.length),
      body,
      connected: family.filter(item => item !== id),
      attachments: [],
      source: "hub" as const,
      updated_at: now,
    };
  });
  const kept: Page = {
    ...page,
    title: partTitle(page.title, 0, chunks.length),
    body: chunks[0]!,
    connected: [...new Set([...page.connected, ...createdIds])],
    updated_at: now,
  };
  return { kept, created };
}
