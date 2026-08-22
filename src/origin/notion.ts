import type { Origin } from "../domain/page";
import { originsFromNotionProperties, notionIdFromSource } from "./fromPlace";

export type NotionFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function originsFromNotionPage(
  sourceNotionId: string,
  token: string,
  fetchImpl: NotionFetch = fetch,
): Promise<Origin[] | null> {
  const id = notionIdFromSource(sourceNotionId);
  if (!id) return null;
  const response = await fetchImpl(`https://api.notion.com/v1/pages/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { properties?: Record<string, unknown> };
  return originsFromNotionProperties(json.properties ?? {});
}
