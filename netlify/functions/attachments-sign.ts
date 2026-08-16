import type { Handler } from "@netlify/functions";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";
import { parseSignRequest } from "./_lib/attachmentSign";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const denied = requireSession(event);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }
  const parsed = parseSignRequest(raw);
  if ("error" in parsed && parsed.error) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: parsed.error }) };
  }
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Attachment storage is not configured" }) };
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const attachment = parsed.value!.attachment;
  const putUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: attachment.r2_key,
      ContentType: attachment.content_type,
    }),
    { expiresIn: 300 },
  );
  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify({ put_url: putUrl, attachment }),
  };
};
