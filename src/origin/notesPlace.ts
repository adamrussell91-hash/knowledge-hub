import type { Origin } from "../domain/page";
import { normalizeOrigins } from "./normalize";
import notesPlace from "./notesPlace.json";

type NotesPlaceKind = "notebook" | "book" | "pd";

function notionHex(sourceNotionId: string | undefined) {
  if (!sourceNotionId) return null;
  const hex = sourceNotionId.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

const byId = new Map<string, Origin[]>();

function indexKind(kind: NotesPlaceKind) {
  for (const [label, ids] of Object.entries(notesPlace[kind])) {
    for (const id of ids) {
      const hex = notionHex(id);
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

/** Recovered Notion notebook / book / PD pills. Stamp-time only — not used at hub runtime. */
export function originsFromNotesPlace(sourceNotionId?: string): Origin[] {
  const hex = notionHex(sourceNotionId);
  if (!hex) return [];
  return normalizeOrigins(byId.get(hex) ?? []);
}
