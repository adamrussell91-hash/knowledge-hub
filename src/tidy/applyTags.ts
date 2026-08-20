import { isTopicKeyword } from "../archive/keywordGraph";
import { canonicalTopicTag } from "./vocabulary";

const MAX_TOPIC_TAGS = 3;

function uniqueCaseInsensitive(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter(tag => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Maps model suggestions onto the closed list and drops anything else. */
export function normalizeTopicTags(tags: string[]) {
  return uniqueCaseInsensitive(
    tags.map(canonicalTopicTag).filter((tag): tag is string => Boolean(tag)),
  ).slice(0, MAX_TOPIC_TAGS);
}

/** Replaces topic tags, while leaving Note, unit codes, and other structural tags untouched. */
export function applyTopicTags(existing: string[], proposed: string[]) {
  const structural = uniqueCaseInsensitive(existing.map(tag => tag.trim()).filter(tag => tag && !isTopicKeyword(tag)));
  return [...structural, ...normalizeTopicTags(proposed)];
}

/** Toggle one closed-list topic tag. A fourth topic tap is a no-op. */
export function toggleTopicTag(existing: string[], tapped: string) {
  const canonical = canonicalTopicTag(tapped);
  const selected = normalizeTopicTags(existing);
  if (canonical && selected.some(tag => tag.toLowerCase() === canonical.toLowerCase())) {
    return applyTopicTags(
      existing,
      selected.filter(tag => tag.toLowerCase() !== canonical.toLowerCase()),
    );
  }
  if (selected.length >= MAX_TOPIC_TAGS) return existing;
  return applyTopicTags(existing, [...selected, tapped]);
}

export function topicTagsEqual(a: string[], b: string[]) {
  const topics = (tags: string[]) =>
    uniqueCaseInsensitive(tags.filter(isTopicKeyword).map(tag => canonicalTopicTag(tag) ?? tag.toLowerCase()))
      .map(tag => tag.toLowerCase())
      .sort();
  return JSON.stringify(topics(a)) === JSON.stringify(topics(b));
}
