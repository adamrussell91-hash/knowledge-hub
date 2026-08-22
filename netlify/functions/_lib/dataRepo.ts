import { readFile } from "node:fs/promises";
import path from "node:path";
import { PageManifestEntrySchema, type Page, type PageManifestEntry } from "../../../src/domain/page";
import { stripMarkdownForExcerpt } from "../../../src/lib/plainExcerpt";
import { resolvedOrigins } from "../../../src/origin/notesPlace";
import { getContent } from "./githubWrite";
export function toManifestEntry(page: Page): PageManifestEntry {
  const plain = stripMarkdownForExcerpt(page.body);
  return {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt: plain.slice(0, 157) + (plain.length > 157 ? "..." : ""),
    created_at: page.created_at,
    ...(resolvedOrigins(page).length ? { origins: resolvedOrigins(page) } : {}),
  };
}
export function githubNetworkError(error: unknown) { const cause = error instanceof Error && "cause" in error ? String(error.cause) : String(error); return new Error(`GitHub network error: ${cause}`); }
export type ManifestFileEntry = PageManifestEntry & { path: string };
export function parseManifest(input: unknown): ManifestFileEntry[] {
  return (input as { path: string }[]).map(item => {
    const parsed = PageManifestEntrySchema.parse(item);
    const origins = resolvedOrigins(parsed);
    return { ...parsed, ...(origins.length ? { origins } : {}), path: item.path };
  });
}
export interface DataRepo { listManifest(): Promise<ManifestFileEntry[]>; listPages(): Promise<Page[]>; getPage(id: string): Promise<Page | null> }
class FixtureRepo implements DataRepo { private cache?: Page[]; async listPages(): Promise<Page[]> { if (!this.cache) this.cache = JSON.parse(await readFile(path.join(process.cwd(), "fixtures/seed.json"), "utf8")) as Page[]; return this.cache; } async listManifest() { return (await this.listPages()).map(page => ({ ...toManifestEntry(page), path: `pages/${page.id}.json` })); } async getPage(id: string) { return (await this.listPages()).find(page => page.id === id) ?? null; } }
class GitHubRepo implements DataRepo {
  constructor(private readonly repo: string, private readonly token: string) {}
  private async read<T>(file: string): Promise<T> {
    const current = await getContent(this.repo, this.token, file);
    if (!current) throw new Error(`GitHub data repo error 404: ${file}`);
    try {
      return JSON.parse(current.text) as T;
    } catch {
      throw new Error(`GitHub data repo error: ${file} is not JSON`);
    }
  }
  async listManifest() {
    return parseManifest(await this.read<unknown>("manifest.json"));
  }
  async listPages() {
    return Promise.all((await this.listManifest()).map(item => this.read<Page>(item.path)));
  }
  async getPage(id: string) {
    try {
      return await this.read<Page>(`pages/${id}.json`);
    } catch {
      return null;
    }
  }
}
export function createDataRepo(): DataRepo { return process.env.GITHUB_DATA_REPO && process.env.GITHUB_DATA_REPO_TOKEN ? new GitHubRepo(process.env.GITHUB_DATA_REPO, process.env.GITHUB_DATA_REPO_TOKEN) : new FixtureRepo(); }
