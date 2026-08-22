import type { Origin, OriginKind } from "../domain/page";
import { mergeOrigins, normalizeOriginLabel, normalizeOrigins } from "./normalize";
import { applyUnitDegreeMap } from "./unitDegrees";

const UNIT_CODE = /^[A-Z]{2,}\d/i;

const PROPERTY_KIND: Record<string, OriginKind> = {
  degree: "degree",
  programme: "degree",
  program: "degree",
  "course of study": "degree",
  unit: "unit",
  "unit code": "unit",
  "unit number": "unit",
  "course code": "unit",
  course: "unit",
  notebook: "notebook",
  notebooks: "notebook",
  journal: "notebook",
  "source notebook": "notebook",
  book: "book",
  "book title": "book",
  "book/journal": "book",
  reading: "book",
  pd: "pd",
  "professional development": "pd",
  "pd session": "pd",
  "professional development session": "pd",
  workshop: "pd",
  pl: "pd",
};

function splitLabels(raw: string) {
  return raw
    .split(/[,;|]/)
    .map(part => normalizeOriginLabel(part))
    .filter(Boolean);
}

export function unitCodeFromLabel(label: string) {
  const match = normalizeOriginLabel(label).match(/^([A-Za-z]{2,}\d[A-Za-z0-9]*)/);
  return match ? match[1]!.toUpperCase() : normalizeOriginLabel(label);
}

export function originsFromUnitTags(tags: string[]): Origin[] {
  return normalizeOrigins(
    tags.filter(tag => UNIT_CODE.test(tag.trim())).map(tag => ({ kind: "unit" as const, label: unitCodeFromLabel(tag) })),
  );
}

export function originsFromBody(body: string): Origin[] {
  const out: Origin[] = [];
  for (const line of body.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z /]+):\s*(.+?)\s*$/);
    if (!match) continue;
    const kind = PROPERTY_KIND[match[1]!.trim().toLowerCase()];
    if (!kind) continue;
    for (const label of splitLabels(match[2]!)) out.push({ kind, label });
  }
  return normalizeOrigins(out);
}

export function inferOriginFromLabel(label: string): Origin | null {
  const trimmed = normalizeOriginLabel(label);
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (UNIT_CODE.test(trimmed)) return { kind: "unit", label: trimmed };
  if (/\b(m\.?ed|ph\.?d|b\.?ed|b\.?a|bachelor|master|doctorate|graduate certificate)\b/i.test(trimmed)) {
    return { kind: "degree", label: trimmed };
  }
  if (/\b(notebook|journal)\b/i.test(lower)) return { kind: "notebook", label: trimmed };
  if (/\b(pd|professional development|workshop|pl session)\b/i.test(lower)) return { kind: "pd", label: trimmed };
  if (/\bbook\b/i.test(lower)) return { kind: "book", label: trimmed };
  return null;
}

export function notionPropertyLabels(value: unknown): string[] {
  if (typeof value === "string") return splitLabels(value);
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(notionPropertyLabels);
  const rec = value as Record<string, unknown>;
  if (typeof rec.name === "string") return [normalizeOriginLabel(rec.name)].filter(Boolean);
  if (typeof rec.plain_text === "string") return [normalizeOriginLabel(rec.plain_text)].filter(Boolean);
  if (rec.type === "select") return notionPropertyLabels(rec.select);
  if (rec.type === "multi_select") return notionPropertyLabels(rec.multi_select);
  if (rec.type === "rich_text") {
    const text = (Array.isArray(rec.rich_text) ? rec.rich_text : [])
      .map(item => (item && typeof item === "object" && "plain_text" in item ? String(item.plain_text ?? "") : ""))
      .join("");
    return splitLabels(text);
  }
  if (rec.type === "title") {
    const text = (Array.isArray(rec.title) ? rec.title : [])
      .map(item => (item && typeof item === "object" && "plain_text" in item ? String(item.plain_text ?? "") : ""))
      .join("");
    return splitLabels(text);
  }
  return [];
}

export function notionRelationIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const rec = value as Record<string, unknown>;
  if (rec.type !== "relation" || !Array.isArray(rec.relation)) return [];
  return rec.relation
    .map(item => (item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : ""))
    .filter(Boolean);
}

function originLabel(kind: OriginKind, label: string) {
  return kind === "unit" ? unitCodeFromLabel(label) : label;
}

export function originsFromNotionProperties(properties: Record<string, unknown>): Origin[] {
  const out: Origin[] = [];
  for (const [name, value] of Object.entries(properties)) {
    const kind = PROPERTY_KIND[name.trim().toLowerCase()];
    const labels = notionPropertyLabels(value);
    if (kind) {
      for (const label of labels) out.push({ kind, label: originLabel(kind, label) });
      continue;
    }
    if (!/^(type|source|origin|place|uni type)$/i.test(name)) continue;
    for (const label of labels) {
      const inferred = inferOriginFromLabel(label);
      if (inferred) out.push(inferred);
    }
  }
  return normalizeOrigins(out);
}

export function stampPageOrigins(
  page: { tags: string[]; body: string; origins?: Origin[] },
  extra: Origin[] = [],
) {
  return applyUnitDegreeMap(
    mergeOrigins(page.origins ?? [], originsFromUnitTags(page.tags), originsFromBody(page.body), extra),
  );
}

export function notionIdFromSource(sourceNotionId: string) {
  const hex = sourceNotionId.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
