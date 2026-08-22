import type { Origin } from "../domain/page";
import { mergeOrigins, normalizeOrigins, pageOrigins } from "./normalize";
import notesPlace from "./notesPlace.json";

type NotesPlaceKind = "notebook" | "book" | "pd";

/** Pull a Notion page hex out of a bare id, dashed UUID, page_notion_* id, or URL. */
export function extractNotionHex(value: string | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  const prefixed = lower.match(/page_notion_([0-9a-f]{32})/);
  if (prefixed?.[1]) return prefixed[1];
  const dashed = lower.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (dashed) return dashed[0].replace(/-/g, "");
  const compact = lower.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/.test(compact)) return compact;
  const embedded = lower.match(/[0-9a-f]{32}/g);
  return embedded?.[embedded.length - 1] ?? null;
}

const byId = new Map<string, Origin[]>();

function indexKind(kind: NotesPlaceKind) {
  for (const [label, ids] of Object.entries(notesPlace[kind])) {
    for (const id of ids) {
      const hex = extractNotionHex(id);
      if (!hex) continue;
      const list = byId.get(hex) ?? [];
      list.push({ kind, label });
      byId.set(hex, list);
    }
  }
}

indexKind("notebook");
indexKind("book");
indexKind("pd");

/** Recovered Notion notebook / book / PD pills, keyed by Notion page hex. */
export function originsFromNotesPlace(sourceNotionId?: string): Origin[] {
  const hex = extractNotionHex(sourceNotionId);
  if (!hex) return [];
  return normalizeOrigins(byId.get(hex) ?? []);
}

/** Stored pills plus recovered notebook / book / PD from the page’s Notion id. */
export function resolvedOrigins(page: {
  id?: string;
  origins?: Origin[];
  source_notion_id?: string;
  source_notion_url?: string;
}): Origin[] {
  return mergeOrigins(
    pageOrigins(page),
    originsFromNotesPlace(page.source_notion_id),
    originsFromNotesPlace(page.id),
    originsFromNotesPlace(page.source_notion_url),
  );
}
