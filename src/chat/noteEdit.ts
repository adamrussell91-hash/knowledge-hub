import type { Page } from "../domain/page";
import { applyTopicTags, normalizeTopicTags } from "../tidy/applyTags";

export type RetagProposal = {
  action: "retag";
  pageId: string;
  title: string;
  tags: string[];
};

const FENCE = /```note-edit\s*([\s\S]*?)```/i;

export function parseNoteEdit(reply: string): { prose: string; edit?: RetagProposal } {
  const match = FENCE.exec(reply);
  if (!match) return { prose: reply.trim() };
  const prose = `${reply.slice(0, match.index)}${reply.slice(match.index + match[0].length)}`.trim();
  try {
    const raw = JSON.parse(match[1]!) as Partial<RetagProposal>;
    if (raw.action !== "retag" || typeof raw.pageId !== "string" || !raw.pageId.trim()) {
      return { prose };
    }
    if (typeof raw.title !== "string" || !raw.title.trim()) return { prose };
    if (!Array.isArray(raw.tags)) return { prose };
    const tags = normalizeTopicTags(raw.tags.map(tag => String(tag)));
    if (!tags.length) return { prose };
    return {
      prose,
      edit: { action: "retag", pageId: raw.pageId.trim(), title: raw.title.trim(), tags },
    };
  } catch {
    return { prose };
  }
}

export function applyRetagToPage(page: Page, tags: string[]): Page {
  return {
    ...page,
    tags: applyTopicTags(page.tags, tags),
    updated_at: new Date().toISOString(),
  };
}

export function retagDelta(currentTopics: string[], nextTopics: string[]) {
  const current = new Set(currentTopics.map(tag => tag.toLowerCase()));
  const next = new Set(nextTopics.map(tag => tag.toLowerCase()));
  return {
    removed: currentTopics.filter(tag => !next.has(tag.toLowerCase())),
    added: nextTopics.filter(tag => !current.has(tag.toLowerCase())),
    kept: nextTopics.filter(tag => current.has(tag.toLowerCase())),
  };
}
