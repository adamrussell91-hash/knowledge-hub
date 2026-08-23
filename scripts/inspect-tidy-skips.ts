import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PageSchema, type Page } from "../src/domain/page";
import { isTopicKeyword } from "../src/archive/keywordGraph";
import { isMessy } from "../src/tidy/messy";
import { tidyQualityIssues } from "../src/tidy/propose";
import { canonicalTopicTag } from "../src/tidy/vocabulary";
import type { TidySkipEntry } from "./run-tidy";

function flagsFor(page: Page) {
  const flags: string[] = [];
  if (page.body.length >= 12_000) flags.push("long-body");
  if (page.body.length < 40) flags.push("tiny-body");
  if (/%2f[^\s)]*\.md\b/i.test(page.body)) flags.push("encoded-md-path");
  if (/\b(?:APA 7 reference|Tracker record|Evidence contribution|HPGE connection):/i.test(page.body)) flags.push("extraction-dump");
  if (/\bGif$/i.test(page.title.trim()) || (page.title.startsWith("'") && ((page.title.match(/['"]/g) ?? []).length % 2 !== 0))) {
    flags.push("broken-title");
  }
  if (page.tags.filter(isTopicKeyword).some(tag => !canonicalTopicTag(tag))) flags.push("unknown-topic-tags");
  if (isMessy(page)) flags.push("messy");
  const dummy = tidyQualityIssues(page, { tags: ["Philosophy Knowledge and Society"], body: page.body, title: null });
  flags.push(...dummy.map(issue => `quality:${issue}`));
  return [...new Set(flags)];
}

export async function main(args = process.argv.slice(2)) {
  const dataDir = args[args.indexOf("--data-dir") + 1];
  if (!dataDir || args.indexOf("--data-dir") < 0) throw new Error("--data-dir is required");
  const skips = JSON.parse(await readFile(path.join(dataDir, "_tidy", "backfill-skip-list.json"), "utf8")) as TidySkipEntry[];
  const known = new Set((await readdir(path.join(dataDir, "pages"))).filter(file => file.endsWith(".json")).map(file => file.slice(0, -5)));
  const rows = [];
  for (const skip of skips) {
    const raw = known.has(skip.id) ? await readFile(path.join(dataDir, "pages", `${skip.id}.json`), "utf8") : null;
    const page = raw ? PageSchema.safeParse(JSON.parse(raw)) : null;
    if (!page?.success) {
      rows.push({ id: skip.id, reason: skip.reason, title: null, chars: 0, flags: ["unreadable"] });
      continue;
    }
    rows.push({
      id: skip.id,
      reason: skip.reason,
      title: page.data.title,
      chars: page.data.body.length,
      tags: page.data.tags,
      flags: flagsFor(page.data),
    });
  }
  const byReason = Object.fromEntries(
    [...new Set(rows.map(row => row.reason))].map(reason => [reason, rows.filter(row => row.reason === reason).length]),
  );
  const byFlag: Record<string, number> = {};
  for (const row of rows) for (const flag of row.flags) byFlag[flag] = (byFlag[flag] ?? 0) + 1;
  const lengths = rows.map(row => row.chars).sort((a, b) => a - b);
  const percentile = (fraction: number) => lengths[Math.floor((lengths.length - 1) * fraction)] ?? 0;
  const summary = {
    count: rows.length,
    byReason,
    byFlag,
    chars: { min: lengths[0] ?? 0, p50: percentile(0.5), p90: percentile(0.9), max: lengths.at(-1) ?? 0 },
    longBody: rows.filter(row => row.chars >= 12_000).length,
    samples: rows
      .slice()
      .sort((a, b) => b.chars - a.chars)
      .slice(0, 12)
      .map(row => ({ id: row.id, title: row.title, chars: row.chars, flags: row.flags, reason: row.reason })),
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
