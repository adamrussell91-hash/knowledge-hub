import type { Page, PageManifestEntry } from "../domain/page";
import { newFsrsCard, type QuizItem, type QuizItemKind } from "./schema";

const MIN_BODY = 80;
const MAX_ITEMS = 12;
const SKIP_HEADINGS = new Set(["references", "further reading", "see also"]);

export function quizItemId(pageId: string, kind: QuizItemKind, cue: string) {
  const key = `${pageId}\n${kind}\n${cue}`;
  let h1 = 2166136261;
  let h2 = 2166136261;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 = Math.imul(h2 ^ code, 16777619);
  }
  return `item_${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function harvestPage(page: Page, now: Date = new Date()): QuizItem[] {
  if (page.body.trim().length < MIN_BODY) return [];
  const items: QuizItem[] = [];
  const seen = new Set<string>();
  const push = (kind: QuizItemKind, cue: string, answer: string) => {
    const cleanCue = cue.replace(/\s+/g, " ").trim();
    const cleanAnswer = answer.replace(/\s+/g, " ").trim();
    if (!cleanCue || !cleanAnswer || items.length >= MAX_ITEMS) return;
    const id = quizItemId(page.id, kind, cleanCue);
    if (seen.has(id)) return;
    seen.add(id);
    items.push({
      id,
      page_id: page.id,
      area: page.area,
      tags: page.tags,
      kind,
      cue: cleanCue,
      answer: cleanAnswer,
      harvested_at: now.toISOString(),
      source_updated_at: page.updated_at,
      fsrs: newFsrsCard(now),
      status: "untested",
    });
  };

  for (const pair of extractQa(page.body)) {
    push("qa", pair.cue, pair.answer);
    if (items.length >= MAX_ITEMS) return items;
  }
  for (const def of extractDefinitions(page.body)) {
    push("definition", def.cue, def.answer);
    if (items.length >= MAX_ITEMS) return items;
  }
  for (const cloze of extractClozes(page.body)) {
    push("cloze", cloze.cue, cloze.answer);
    if (items.length >= MAX_ITEMS) return items;
  }
  for (const heading of extractHeadings(page.body)) {
    push("heading", `What does this note claim about: ${heading.cue}?`, heading.answer);
    if (items.length >= MAX_ITEMS) return items;
  }
  return items;
}

function extractQa(body: string) {
  const pairs: { cue: string; answer: string }[] = [];
  const re =
    /(?:^|\n)\s*(?:\*\*)?(?:Q|Question)(?:\*\*)?:\s*(.+?)\s*(?:\n+)\s*(?:\*\*)?(?:A|Answer|Explain)(?:\*\*)?:\s*([\s\S]*?)(?=(?:\n\s*(?:\*\*)?(?:Q|Question)(?:\*\*)?:)|\n#{1,3}\s|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    pairs.push({ cue: stripMd(match[1]), answer: stripMd(match[2]) });
  }
  return pairs;
}

function extractDefinitions(body: string) {
  const defs: { cue: string; answer: string }[] = [];
  const re = /\*\*([^*]+)\*\*\s*(?::|—|–| is )\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const term = match[1].trim();
    if (/^(Q|A|Question|Answer|Explain)$/i.test(term)) continue;
    defs.push({ cue: term, answer: stripMd(match[2]).replace(/^is\s+/i, "") });
  }
  return defs;
}

function extractClozes(body: string) {
  const clozes: { cue: string; answer: string }[] = [];
  const lines = body.split("\n");
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const answer = stripMd(buf.join(" ").replace(/\s+/g, " ").trim());
    const cloze = toCloze(answer);
    if (cloze) clozes.push(cloze);
    buf = [];
  };
  for (const line of lines) {
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) buf.push(quote[1]);
    else flush();
  }
  flush();
  return clozes;
}

function toCloze(answer: string) {
  const words = answer.split(" ").filter(Boolean);
  let longIndex = 0;
  let longCount = 0;
  const cue = words
    .map(word => {
      const core = word.replace(/[^A-Za-z0-9]/g, "");
      if (core.length <= 4) return word;
      const blank = longIndex % 2 === 1;
      longIndex += 1;
      longCount += 1;
      return blank ? word.replace(core, "_____") : word;
    })
    .join(" ");
  if (longCount < 4) return null;
  return { cue, answer };
}

function extractHeadings(body: string) {
  const headings: { cue: string; answer: string }[] = [];
  const lines = body.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{2,3}\s+(.+?)\s*$/);
    if (!heading) continue;
    const title = stripMd(heading[1]);
    if (SKIP_HEADINGS.has(title.toLowerCase())) continue;
    const parts: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,3}\s/.test(lines[j])) break;
      if (lines[j].trim() === "") {
        if (parts.length) break;
        continue;
      }
      parts.push(lines[j]);
    }
    if (parts.length) headings.push({ cue: title, answer: stripMd(parts.join(" ")) });
  }
  return headings;
}

export function pagesToHarvest(
  manifest: PageManifestEntry[],
  knownPageIds: Set<string>,
  options: { area?: "university" | "notes"; tags?: string[]; limit: number },
) {
  const tags = options.tags ?? [];
  return manifest
    .filter(page => {
      if (knownPageIds.has(page.id)) return false;
      if (options.area && page.area !== options.area) return false;
      if (tags.length && !tags.every(tag => page.tags.includes(tag))) return false;
      return true;
    })
    .sort((a, b) => {
      const score = (page: PageManifestEntry) => tags.filter(tag => page.tags.includes(tag)).length;
      return score(b) - score(a) || a.title.localeCompare(b.title);
    })
    .slice(0, options.limit);
}

function stripMd(value: string) {
  return value.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
}
