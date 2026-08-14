import type { Page, PageManifestEntry } from "../domain/page";
import { API_BASE } from "./config";
import { localGetPage, localListPages, localSearchPages } from "./localData";
import { lexicalRetrieve } from "../lib/lexicalRetrieve";

export const USE_LOCAL_DATA =
  import.meta.env.VITE_USE_LOCAL_DATA === "true" ||
  (Boolean(import.meta.env.DEV) && import.meta.env.MODE !== "test");

export type AlchemistConnection = {
  icon: string;
  summary: string;
  sourcePageId: string;
  sourcePageTitle: string;
  sourceExcerpt: string;
  whyNonObvious: string;
};

export type AlchemistResult = {
  connections: AlchemistConnection[];
  mode: "synthesis" | "retrieval" | "empty" | "local";
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) throw new Error(`API error ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export const listPages = (): Promise<PageManifestEntry[]> =>
  USE_LOCAL_DATA ? localListPages() : apiFetch<PageManifestEntry[]>("/pages");

export const getPage = (id: string): Promise<Page> =>
  USE_LOCAL_DATA ? localGetPage(id) : apiFetch<Page>(`/pages/${encodeURIComponent(id)}`);

export const searchPages = (query: string): Promise<PageManifestEntry[]> =>
  USE_LOCAL_DATA
    ? localSearchPages(query)
    : apiFetch<PageManifestEntry[]>(`/search?q=${encodeURIComponent(query)}`);

export async function getAttachmentUrl(
  pageId: string,
  attachmentId: string,
): Promise<{ url: string }> {
  if (USE_LOCAL_DATA) {
    throw new Error("Signed downloads need the Netlify API — local preview shows the attachment UI only.");
  }
  return apiFetch<{ url: string }>(
    `/attachments/${encodeURIComponent(pageId)}/${encodeURIComponent(attachmentId)}`,
  );
}

export async function login(passphrase: string): Promise<boolean> {
  if (USE_LOCAL_DATA) return true;
  const response = await fetch(`${API_BASE}/auth-login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  return response.ok;
}

export async function logout(): Promise<void> {
  if (USE_LOCAL_DATA) return;
  await fetch(`${API_BASE}/auth-logout`, { method: "POST", credentials: "include" });
}

/** Local lexical alchemist; production Teaching Hub path still uses the Netlify function + shared secret. */
export async function runAlchemist(lessonText: string): Promise<AlchemistResult> {
  if (USE_LOCAL_DATA) {
    const entries = await localListPages();
    const hits = lexicalRetrieve(
      entries.map(entry => ({
        id: entry.id,
        title: entry.title,
        excerpt: entry.excerpt,
        tags: entry.tags,
        area: entry.area,
      })),
      lessonText,
      8,
    );
    return {
      mode: hits.length ? "local" : "empty",
      connections: hits.map(hit => ({
        icon: "Multiple Perspectives",
        summary: `Related archive note: ${hit.title}`,
        sourcePageId: hit.id,
        sourcePageTitle: hit.title,
        sourceExcerpt: hit.excerpt,
        whyNonObvious:
          "Local lexical retrieval — no Anthropic call in preview. Open the note to judge whether the link is non-obvious.",
      })),
    };
  }

  return apiFetch<AlchemistResult>("/lesson-alchemist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonText }),
  });
}
