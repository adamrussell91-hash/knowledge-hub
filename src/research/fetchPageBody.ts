export type PageBody = {
  id: string;
  title: string;
  body: string;
  source_notion_url: string;
};

export async function fetchPageBody(
  pageId: string,
  adapters: {
    fromR2: (pageId: string) => Promise<PageBody | null>;
    fromGitHub: (pageId: string) => Promise<PageBody | null>;
  },
): Promise<PageBody | null> {
  return (await adapters.fromR2(pageId)) ?? adapters.fromGitHub(pageId);
}

export function excerptFromBody(body: string, length = 300) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, length);
}
