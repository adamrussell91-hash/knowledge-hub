import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ChatWriteState } from "../../../src/chat/writeHttp";

const PREFIX = "chat-writes/";

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Book note write store is not configured");
  }
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export function isBookWriteSessionId(id: string) {
  return id.startsWith("book_");
}

export async function putChatWrite(state: ChatWriteState) {
  const { bucket, client } = r2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${PREFIX}${state.writeSessionId}.json`,
      Body: JSON.stringify(state),
      ContentType: "application/json",
    }),
  );
  return state;
}

export async function getChatWrite(writeSessionId: string): Promise<ChatWriteState | null> {
  const { bucket, client } = r2Client();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: `${PREFIX}${writeSessionId}.json`,
      }),
    );
    const text = await response.Body?.transformToString();
    if (!text) return null;
    const parsed = JSON.parse(text) as ChatWriteState;
    if (!parsed?.writeSessionId || !parsed.status) return null;
    return parsed;
  } catch (error) {
    const name = error && typeof error === "object" ? String((error as { name?: string }).name ?? "") : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}
