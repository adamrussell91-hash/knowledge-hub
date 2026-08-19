import { PageSchema, type Page, type PageManifestEntry } from "../domain/page";
import { getContent, putContent } from "../../netlify/functions/_lib/githubWrite";
import { applyTidyProposal, proposeTidy } from "./propose";
import type { TidyProposal } from "./types";
import { tidyOnePage, type TidyIO, type TidyState } from "./run";

type ContentFns = {
  getContent: (file: string) => Promise<{ sha: string; text: string } | null>;
  putContent: (file: string, text: string, sha?: string, message?: string) => Promise<void>;
};

async function readJson<T>(fns: ContentFns, file: string, fallback: T): Promise<T> {
  const current = await fns.getContent(file);
  if (!current) return fallback;
  try {
    return JSON.parse(current.text) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(fns: ContentFns, file: string, value: unknown, message: string) {
  const current = await fns.getContent(file);
  await fns.putContent(file, JSON.stringify(value), current?.sha, message);
}

export function githubTidyIo(input: {
  fns: ContentFns;
  propose: (page: Page) => Promise<TidyProposal | null>;
  now?: () => string;
}): Omit<TidyIO, "id" | "scan" | "count"> {
  return {
    listPageIds: async () => [],
    readPage: async id => {
      const current = await input.fns.getContent(`pages/${id}.json`);
      if (!current) return null;
      const parsed = PageSchema.safeParse(JSON.parse(current.text));
      return parsed.success ? parsed.data : null;
    },
    writePage: async page => {
      const current = await input.fns.getContent(`pages/${page.id}.json`);
      await input.fns.putContent(`pages/${page.id}.json`, JSON.stringify(page), current?.sha, `Tidy ${page.id}`);
    },
    readManifest: () => readJson<PageManifestEntry[]>(input.fns, "manifest.json", []),
    writeManifest: entries => writeJson(input.fns, "manifest.json", entries, "Tidy manifest"),
    readState: () => readJson<TidyState>(input.fns, "_tidy/state.json", { tidied: {} }),
    writeState: state => writeJson(input.fns, "_tidy/state.json", state, "Tidy state"),
    propose: input.propose,
    now: input.now ?? (() => new Date().toISOString()),
  };
}

export function githubContentFns(repo: string, token: string): ContentFns {
  return {
    getContent: file => getContent(repo, token, file),
    putContent: (file, text, sha, message) => putContent(repo, token, file, text, sha, message),
  };
}

export async function tidyPageOnGitHub(input: {
  id: string;
  repo: string;
  token: string;
  apiKey: string;
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<Page> {
  return tidyOnePage(
    input.id,
    githubTidyIo({
      fns: githubContentFns(input.repo, input.token),
      propose: page =>
        proposeTidy({
          page,
          prompt: input.prompt,
          apiKey: input.apiKey,
          fetchImpl: input.fetchImpl,
        }),
    }),
  );
}

/** Button path: one Claude rewrite, then the same GitHub save as Edit. No tidy-state bookkeeping. */
export async function tidyPageDirect(input: {
  id: string;
  repo: string;
  token: string;
  apiKey: string;
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<Page> {
  const fns = githubContentFns(input.repo, input.token);
  const current = await fns.getContent(`pages/${input.id}.json`);
  if (!current) throw new Error("Page was not found");
  let raw: unknown;
  try {
    raw = JSON.parse(current.text);
  } catch {
    throw new Error("Page is invalid");
  }
  const parsed = PageSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Page is invalid");
  const proposal = await proposeTidy({
    page: parsed.data,
    prompt: input.prompt,
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
  });
  if (!proposal) throw new Error("Claude didn’t return a usable tidy");
  const stored: Page = {
    ...applyTidyProposal(parsed.data, proposal),
    created_at: parsed.data.created_at,
    updated_at: new Date().toISOString(),
  };
  await fns.putContent(`pages/${input.id}.json`, JSON.stringify(stored), current.sha, `Save ${input.id}`);
  return stored;
}
