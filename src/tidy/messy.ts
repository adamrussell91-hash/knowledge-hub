import type { Page } from "../domain/page";
import { isTopicKeyword } from "../archive/keywordGraph";
import { canonicalTopicTag } from "./vocabulary";

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function hasUnknownTopics(page: Page) {
  return page.tags.filter(isTopicKeyword).some(tag => !canonicalTopicTag(tag));
}

function hasParagraphSpam(body: string) {
  const paragraphs = body.trim().split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  let run = 0;
  for (const paragraph of paragraphs) {
    const prose = !/^(?:[-*+] |\d+\. |>|Q:|A:)/.test(paragraph);
    const sentences = (paragraph.match(/[.!?](?:\s|$)/g) ?? []).length;
    run = prose && sentences === 1 ? run + 1 : 0;
    if (run >= 4) return true;
  }
  return false;
}

export function isMessy(page: Page) {
  const body = page.body.replace(/\r\n?/g, "\n");
  const firstLine = body.trimStart().split("\n", 1)[0] ?? "";
  const duplicateH1 = firstLine.startsWith("# ") && normalized(firstLine.slice(2)) === normalized(page.title);
  return (
    page.tags.filter(isTopicKeyword).length > 3 ||
    hasUnknownTopics(page) ||
    /\n[ \t]*\n[ \t]*\n/.test(body) ||
    duplicateH1 ||
    hasParagraphSpam(body)
  );
}

/** A clean note is skippable only when the recorded tidy was after its last edit. */
export function shouldSkipTidy(page: Page, lastTidiedAt?: string) {
  if (isMessy(page) || !lastTidiedAt) return false;
  const tidied = Date.parse(lastTidiedAt);
  const updated = Date.parse(page.updated_at);
  return Number.isFinite(tidied) && Number.isFinite(updated) && tidied > updated;
}

/** Scan/backfill can mark these tidied without a model call. */
export function canStampWithoutModel(page: Page) {
  return !isMessy(page) && page.tags.filter(isTopicKeyword).length >= 1;
}
