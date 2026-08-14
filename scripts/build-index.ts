import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "../src/domain/page";
import { embedTexts } from "../src/lib/embed";
import { createDataRepo } from "../netlify/functions/_lib/dataRepo";
import { loadDotEnv, loadLocalStagedPages } from "./loadLocalPages";

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface IndexEntry {
  pageId: string;
  title: string;
  excerpt: string;
  vector: number[];
}

export interface LexicalCorpusEntry {
  pageId: string;
  title: string;
  excerpt: string;
  tags: string[];
  area: string;
}

const BATCH = 4;

export function excerptFromBody(body: string) {
  return body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function buildIndex(pages: Page[], embed: EmbedFn): Promise<IndexEntry[]> {
  const vectors: number[][] = [];
  for (let offset = 0; offset < pages.length; offset += BATCH) {
    const chunk = pages.slice(offset, offset + BATCH);
    const embedded = await embed(chunk.map(page => `${page.title}\n\n${excerptFromBody(page.body)}`));
    vectors.push(...embedded);
  }
  return pages.map((page, index) => ({
    pageId: page.id,
    title: page.title,
    excerpt: excerptFromBody(page.body),
    vector: vectors[index],
  }));
}

export function buildLexicalCorpus(pages: Page[]): LexicalCorpusEntry[] {
  return pages.map(page => ({
    pageId: page.id,
    title: page.title,
    excerpt: excerptFromBody(page.body),
    tags: page.tags,
    area: page.area,
  }));
}

async function embedOpenAI(texts: string[]) {
  const key = process.env.EMBEDDINGS_API_KEY;
  if (!key) throw new Error("EMBEDDINGS_API_KEY is required for vector index builds");
  return embedTexts(texts, key);
}

async function main() {
  await loadDotEnv();
  const outputDir = path.join(process.cwd(), "migrated");
  await mkdir(outputDir, { recursive: true });
  console.log("Loading pages…");
  const local = await loadLocalStagedPages((done, total) => {
    console.log(`Loaded ${done}/${total} local pages`);
  });
  const pages = local ?? (await createDataRepo().listPages());
  const source = local ? "migrated/data-repo" : "data repo / fixtures";
  console.log(`Using ${pages.length} pages from ${source}`);
  const lexicalPath = path.join(outputDir, "lexical-corpus.json");
  await writeFile(lexicalPath, JSON.stringify(buildLexicalCorpus(pages)));
  console.log(`Wrote lexical corpus (${pages.length} from ${source}) to ${lexicalPath}`);

  if (!process.env.EMBEDDINGS_API_KEY) {
    console.log("Skipping vector index — add EMBEDDINGS_API_KEY to .env to build migrated/index.json");
    return;
  }

  let embedded = 0;
  const index = await buildIndex(pages, async texts => {
    const vectors = await embedOpenAI(texts);
    embedded += texts.length;
    console.log(`Embedded ${embedded}/${pages.length}`);
    return vectors;
  });
  const indexPath = path.join(outputDir, "index.json");
  await writeFile(indexPath, JSON.stringify(index));
  console.log(`Wrote vector index to ${indexPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
