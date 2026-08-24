export type PageBody = {
  id: string;
  title: string;
  body: string;
  source_notion_url: string;
  tags?: string[];
};

export const SNIPPET_EXCERPT_CHARS = 300;
export const SYNTHESIS_EXCERPT_CHARS = 900;

export function normalizePageBody(raw: unknown): PageBody | null {
  if (!raw || typeof raw !== "object") return null;
  const page = raw as {
    id?: unknown;
    title?: unknown;
    body?: unknown;
    source_notion_url?: unknown;
    tags?: unknown;
  };
  if (typeof page.id !== "string" || !page.id.trim()) return null;
  if (typeof page.title !== "string" || !page.title.trim()) return null;
  return {
    id: page.id,
    title: page.title,
    body: typeof page.body === "string" ? page.body : "",
    source_notion_url: typeof page.source_notion_url === "string" ? page.source_notion_url : "",
    tags: Array.isArray(page.tags)
      ? page.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
      : undefined,
  };
}

export async function fetchPageBody(
  pageId: string,
  adapters: {
    fromR2: (pageId: string) => Promise<PageBody | null>;
    fromGitHub: (pageId: string) => Promise<PageBody | null>;
  },
): Promise<PageBody | null> {
  return (await adapters.fromR2(pageId)) ?? adapters.fromGitHub(pageId);
}

export function excerptFromBody(body: string, length = SNIPPET_EXCERPT_CHARS) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, length);
}
