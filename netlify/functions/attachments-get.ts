import type { Handler } from "@netlify/functions";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cors, preflight } from "./_lib/cors";
import { createDataRepo } from "./_lib/dataRepo";
import { requireSession } from "./_lib/requireSession";

export function findAttachment(page: { attachments: { id: string; r2_key: string }[] }, attachmentId: string) { return page.attachments.find(attachment => attachment.id === attachmentId) ?? null; }
export const handler: Handler = async event => { const pre = preflight(event); if (pre) return pre; const denied = requireSession(event); if (denied) return denied; const [pageId, attachmentId] = event.path.split("/").filter(Boolean).slice(-2); const page = await createDataRepo().getPage(pageId ?? ""); const attachment = page && findAttachment(page, attachmentId ?? ""); if (!attachment) return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: "Attachment not found" }) }; const accountId = process.env.R2_ACCOUNT_ID; const bucket = process.env.R2_BUCKET; const accessKeyId = process.env.R2_ACCESS_KEY_ID; const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY; if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Attachment storage is not configured" }) }; const client = new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } }); const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: attachment.r2_key }), { expiresIn: 300 }); return { statusCode: 200, headers: cors(), body: JSON.stringify({ url }) }; };
