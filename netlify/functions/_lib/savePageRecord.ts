import type { Page } from "../../../src/domain/page";
import { parseManifest, toManifestEntry } from "./dataRepo";
import { GitHubWriteError } from "./githubWrite";

export type ContentFns = {
  getContent: (file: string) => Promise<{ sha: string; text: string } | null>;
  putContent: (file: string, text: string, sha?: string, message?: string) => Promise<void>;
};

async function putManifest(page: Page, fns: ContentFns) {
  const current = await fns.getContent("manifest.json");
  const rows = current ? parseManifest(JSON.parse(current.text)) : [];
  const next = {
    ...toManifestEntry(page),
    path: `pages/${page.id}.json`,
  };
  const merged = [...rows.filter(row => row.id !== page.id), next];
  await fns.putContent("manifest.json", JSON.stringify(merged), current?.sha, `Upsert ${page.id}`);
}

export async function savePageRecord(page: Page, fns: ContentFns): Promise<Page> {
  const path = `pages/${page.id}.json`;
  const existing = await fns.getContent(path);
  const stored: Page = {
    ...page,
    created_at: existing ? (JSON.parse(existing.text) as Page).created_at : page.created_at,
    updated_at: new Date().toISOString(),
  };
  await fns.putContent(path, JSON.stringify(stored), existing?.sha, `Save ${page.id}`);
  try {
    await putManifest(stored, fns);
  } catch (error) {
    if (!(error instanceof GitHubWriteError) || error.status !== 409) throw error;
    try {
      await putManifest(stored, fns);
    } catch (retry) {
      if (retry instanceof GitHubWriteError && retry.status === 409) {
        throw new GitHubWriteError("save collided, try again", 409);
      }
      throw retry;
    }
  }
  return stored;
}
