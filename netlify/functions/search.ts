import type { Handler } from "@netlify/functions";
import type { PageManifestEntry } from "../../src/domain/page";
import { resolvedOrigins } from "../../src/origin/notesPlace";
import { cors, preflight } from "./_lib/cors";
import { createDataRepo } from "./_lib/dataRepo";
import { requireSession } from "./_lib/requireSession";

export function rankByQuery(entries: PageManifestEntry[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return entries
    .filter(entry =>
      [entry.title, entry.excerpt, ...entry.tags, ...resolvedOrigins(entry).map(origin => origin.label)].some(value =>
        value.toLowerCase().includes(needle),
      ),
    )
    .sort((a, b) => Number(b.title.toLowerCase().includes(needle)) - Number(a.title.toLowerCase().includes(needle)));
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  const query = event.queryStringParameters?.q ?? "";
  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify(rankByQuery(await createDataRepo().listManifest(), query)),
  };
};
