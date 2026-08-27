import type { Origin, Page } from "../domain/page";
import { normalizeOrigins } from "../origin/normalize";
import type { ResearchFinding } from "../research/schema";

export type SavableFinding = ResearchFinding & { external?: boolean };

const TOO_SHORT = /^(ok|okay|thanks|thank you|yes|no|sure|done)[.!]?$/i;

export function briefIsSavable(reply: string): boolean {
  const text = reply.trim();
  if (text.length < 160) return false;
  if (TOO_SHORT.test(text)) return false;
  return true;
}

function titleFrom(reply: string): string {
  const heading = reply.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 80);
  const sentence = reply.trim().split(/\n/)[0]?.replace(/^#+\s*/, "").trim() ?? "";
  return (sentence || "Research brief").slice(0, 80);
}

function archiveFindings(findings: SavableFinding[]) {
  return findings.filter(item => !item.external && item.pageId && !item.pageId.startsWith("ext-"));
}

export function briefToPage(input: {
  reply: string;
  findings: SavableFinding[];
  now: string;
  id: string;
  origins?: Origin[];
}): Page {
  const archive = archiveFindings(input.findings);
  const cites = archive
    .map(item => `- ${item.title} (\`${item.pageId}\`)`)
    .join("\n");
  const body = cites
    ? `${input.reply.trim()}\n\n## Archive citations\n\n${cites}\n`
    : input.reply.trim();
  const origins = input.origins?.length ? normalizeOrigins(input.origins) : undefined;
  return {
    id: input.id,
    title: titleFrom(input.reply),
    area: "notes",
    tags: [],
    ...(origins?.length ? { origins } : {}),
    body,
    connected: [...new Set(archive.map(item => item.pageId))],
    attachments: [],
    source: "hub",
    created_at: input.now,
    updated_at: input.now,
    schema_version: 1,
  };
}
