import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

type Attachment = { r2_key: string; source_path: string; content_type?: string };
type Page = { attachments: Attachment[] };

export function uniqueAttachments(attachments: Attachment[]) { return [...new Map(attachments.map(attachment => [attachment.r2_key, attachment])).values()]; }

async function envValue(name: string) { const env = await readFile(path.join(process.cwd(), ".env"), "utf8"); return env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]; }

async function main() {
  const pages = JSON.parse(await readFile(path.join(process.cwd(), "migrated", "pages-dry-run.json"), "utf8")) as Page[];
  const attachments = uniqueAttachments(pages.flatMap(page => page.attachments));
  const exportRoot = "/Users/adamrussell/Downloads/uni export";
  const missing = await Promise.all(attachments.map(async attachment => { try { await stat(path.join(exportRoot, attachment.source_path)); return null; } catch { return attachment.source_path; } }));
  const dryRun = !process.argv.includes("--execute");
  if (dryRun) return console.log(JSON.stringify({ mode: "dry-run", files: attachments.length, missing: missing.filter(Boolean), execute: "npm run upload-attachments -- --execute" }, null, 2));
  if (missing.some(Boolean)) throw new Error("Refusing upload: attachment source files are missing");
  const accountId = await envValue("R2_ACCOUNT_ID"); const bucket = await envValue("R2_BUCKET"); const accessKeyId = await envValue("R2_ACCESS_KEY_ID"); const secretAccessKey = await envValue("R2_SECRET_ACCESS_KEY");
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) throw new Error("Missing R2 credentials in .env");
  const client = new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  let uploaded = 0; let skipped = 0; let complete = 0;
  async function transfer(attachment: Attachment) { try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: attachment.r2_key })); skipped++; } catch { const body = await readFile(path.join(exportRoot, attachment.source_path)); await client.send(new PutObjectCommand({ Bucket: bucket, Key: attachment.r2_key, Body: body, ContentType: attachment.content_type ?? "application/octet-stream" })); uploaded++; } complete++; if (complete % 25 === 0 || complete === attachments.length) console.log(JSON.stringify({ progress: `${complete}/${attachments.length}`, uploaded, skipped })); }
  for (let index = 0; index < attachments.length; index += 8) await Promise.all(attachments.slice(index, index + 8).map(transfer));
  console.log(JSON.stringify({ mode: "executed", uploaded, skipped, total: attachments.length }, null, 2));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
