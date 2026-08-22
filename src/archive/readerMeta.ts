import { escapeHtml } from "../lib/dom";

export function readerTopicPillsHtml(topics: string[]) {
  const rest = topics.slice(1);
  if (!rest.length) return "";
  const pills = rest
    .map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
    .join("");
  return `<div class="reader__meta tag-pills">${pills}</div>`;
}
