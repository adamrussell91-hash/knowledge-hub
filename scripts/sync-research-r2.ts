import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "../src/domain/page";
import { packVectorIndex } from "../src/research/vectorPack";
import { createDataRepo } from "../netlify/functions/_lib/dataRepo";
import type { IndexEntry } from "./build-index";
import { loadDotEnv, loadLocalStagedPages } from "./loadLocalPages";

export const researchObjectKeys = {
  vectors: "research/vectors.bin",
  indexMeta: "research/index-meta.json",
  manifest: "research/manifest.json",
  page: (pageId: string) => `research/pages/${pageId}.json`,
};

async function envValue(name: string) {
  await loadDotEnv();
  return process.env[name];
}

export function researchManifestFromPages(pages: Page[]) {
  return pages.map(page => ({
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt: page.body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 157),
    path: `pages/${page.id}.json`,
  }));
}

export function slimIndex(index: IndexEntry[]) {
  return index.map(entry => ({ pageId: entry.pageId, title: entry.title, vector: entry.vector }));
}

async function main() {
  await loadDotEnv();
  const execute = process.argv.includes("--execute");
  const vectorsOnly = process.argv.includes("--vectors-only");
  const indexPath = path.join(process.cwd(), "migrated", "index.json");
  let index: IndexEntry[] = [];
  try {
    index = JSON.parse(await readFile(indexPath, "utf8")) as IndexEntry[];
  } catch {
    console.log("No migrated/index.json — vector half will be empty until npm run build-index");
  }
  const packed = index.length ? packVectorIndex(slimIndex(index)) : null;
  const objects: { key: string; body: string | Uint8Array; contentType: string }[] = [];
  if (packed) {
    objects.push(
      { key: researchObjectKeys.vectors, body: packed.bytes, contentType: "application/octet-stream" },
      { key: researchObjectKeys.indexMeta, body: JSON.stringify(packed.meta), contentType: "application/json" },
    );
  }
  let pages: Page[] = [];
  if (!vectorsOnly) {
    console.log("Loading pages…");
    pages =
      (await loadLocalStagedPages((done, total) => {
        console.log(`Loaded ${done}/${total} local pages`);
      })) ?? (await createDataRepo().listPages());
    objects.push({
      key: researchObjectKeys.manifest,
      body: JSON.stringify(researchManifestFromPages(pages)),
      contentType: "application/json",
    });
    objects.push(
      ...pages.map(page => ({
        key: researchObjectKeys.page(page.id),
        body: JSON.stringify(page),
        contentType: "application/json",
      })),
    );
  }
  if (!execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          pages: pages.length,
          indexEntries: index.length,
          objects: objects.length,
          packedBytes: packed?.bytes.byteLength ?? 0,
          execute: "npm run sync-research-r2 -- --execute",
          vectorsOnly: "npm run sync-research-r2 -- --execute --vectors-only",
        },
        null,
        2,
      ),
    );
    return;
  }

  const accountId = await envValue("R2_ACCOUNT_ID");
  const bucket = await envValue("R2_BUCKET");
  const accessKeyId = await envValue("R2_ACCESS_KEY_ID");
  const secretAccessKey = await envValue("R2_SECRET_ACCESS_KEY");
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2 credentials in .env");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  let uploaded = 0;
  for (let offset = 0; offset < objects.length; offset += 8) {
    const chunk = objects.slice(offset, offset + 8);
    await Promise.all(
      chunk.map(item =>
        client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: item.key,
            Body: item.body,
            ContentType: item.contentType,
          }),
        ),
      ),
    );
    uploaded += chunk.length;
    console.log(JSON.stringify({ progress: `${uploaded}/${objects.length}` }));
  }
  console.log(JSON.stringify({ mode: "executed", uploaded, total: objects.length }));
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const launchedDirectly =
  !process.env.VITEST &&
  (entry.endsWith(`${path.sep}sync-research-r2.ts`) || entry.endsWith(`${path.sep}sync-research-r2.js`));
if (launchedDirectly) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
