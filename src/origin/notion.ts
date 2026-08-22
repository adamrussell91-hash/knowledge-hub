import type { Origin, OriginKind } from "../domain/page";
import { mergeOrigins } from "./normalize";
import { originsFromNotionProperties, notionIdFromSource, notionPropertyLabels, notionRelationIds } from "./fromPlace";

export type NotionFetch = (url: string, init: RequestInit) => Promise<Response>;

const RELATION_KINDS: Record<string, OriginKind> = {
  "book/journal": "book",
  "professional development session": "pd",
};

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
  };
}

async function notionPageTitle(id: string, token: string, fetchImpl: NotionFetch) {
  const response = await fetchImpl(`https://api.notion.com/v1/pages/${id}`, {
    headers: notionHeaders(token),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { properties?: Record<string, unknown> };
  for (const value of Object.values(json.properties ?? {})) {
    if (value && typeof value === "object" && (value as { type?: string }).type === "title") {
      const label = notionPropertyLabels(value)[0];
      if (label) return label;
    }
  }
  return null;
}

export async function originsFromNotionPage(
  sourceNotionId: string,
  token: string,
  fetchImpl: NotionFetch = fetch,
): Promise<Origin[] | null> {
  const id = notionIdFromSource(sourceNotionId);
  if (!id) return null;
  const response = await fetchImpl(`https://api.notion.com/v1/pages/${id}`, {
    headers: notionHeaders(token),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { properties?: Record<string, unknown> };
  const properties = json.properties ?? {};
  const extras: Origin[] = [];
  for (const [name, value] of Object.entries(properties)) {
    const kind = RELATION_KINDS[name.trim().toLowerCase()];
    if (!kind) continue;
    for (const related of notionRelationIds(value)) {
      const title = await notionPageTitle(related, token, fetchImpl);
      if (title) extras.push({ kind, label: title });
    }
  }
  return mergeOrigins(originsFromNotionProperties(properties), extras);
}
