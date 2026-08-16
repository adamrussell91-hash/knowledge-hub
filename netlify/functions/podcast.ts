import type { Handler } from "@netlify/functions";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cors, preflight } from "./_lib/cors";
import { requireSession } from "./_lib/requireSession";

const DEFAULT_KERNEL_URL = "https://knowledge-hub-research.adamrussell91.workers.dev";

function kernelBase() {
  return (process.env.RESEARCH_KERNEL_URL || DEFAULT_KERNEL_URL).replace(/\/+$/, "");
}

async function kernelFetch(path: string, init: RequestInit) {
  const secret = process.env.RESEARCH_KERNEL_SHARED_SECRET;
  if (!secret) return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Research is unavailable" }) };
  const response = await fetch(`${kernelBase()}${path}`, {
    ...init,
    headers: {
      ...(init.method === "GET" ? {} : { "Content-Type": "application/json" }),
      "x-research-kernel-secret": secret,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    statusCode: response.status || (response.ok ? 200 : 502),
    headers: cors(),
    body: text,
  };
}

export function findTurnAudioKey(episode: { turns: { id: string; audioKey?: string }[] }, turnId: string) {
  return episode.turns.find(turn => turn.id === turnId)?.audioKey ?? null;
}

async function signAudioUrl(key: string) {
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
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
  return { statusCode: 200, headers: cors(), body: JSON.stringify({ url }) };
}

async function signedAudio(episodeId: string, turnId: string) {
  const episodeRes = await kernelFetch(`/podcast/${episodeId}`, { method: "GET" });
  if (episodeRes.statusCode !== 200) return episodeRes;
  let episode: { turns: { id: string; audioKey?: string }[] };
  try {
    episode = JSON.parse(episodeRes.body) as { turns: { id: string; audioKey?: string }[] };
  } catch {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: "Invalid episode" }) };
  }
  const audioKey = Array.isArray(episode.turns) ? findTurnAudioKey(episode, turnId) : null;
  if (!audioKey) return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: "Audio not found" }) };
  return signAudioUrl(audioKey);
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  const path = (event.path ?? "").replace(/\/+$/, "") || "/";
  const body = event.body ?? "{}";

  if (event.httpMethod === "POST" && path.endsWith("/podcast/start")) {
    return kernelFetch("/podcast/start", { method: "POST", body });
  }

  if (event.httpMethod === "POST" && path.endsWith("/podcast/series/start")) {
    return kernelFetch("/podcast/series/start", { method: "POST", body });
  }

  const seriesNext = path.match(/\/podcast\/series\/([^/]+)\/next$/);
  if (seriesNext && event.httpMethod === "POST") {
    return kernelFetch(`/podcast/series/${seriesNext[1]}/next`, { method: "POST", body });
  }

  const seriesGet = path.match(/\/podcast\/series\/([^/]+)$/);
  if (seriesGet && event.httpMethod === "GET") {
    return kernelFetch(`/podcast/series/${seriesGet[1]}`, { method: "GET" });
  }

  if (event.httpMethod === "GET" && /\/podcast$/.test(path)) {
    return kernelFetch("/podcast/index", { method: "GET" });
  }

  const audio = path.match(/\/podcast\/([^/]+)\/audio\/([^/]+)$/);
  if (audio && event.httpMethod === "GET") {
    return signedAudio(audio[1], audio[2]);
  }

  const interrupt = path.match(/\/podcast\/([^/]+)\/interrupt$/);
  if (interrupt && event.httpMethod === "POST") {
    return kernelFetch(`/podcast/${interrupt[1]}/interrupt`, { method: "POST", body });
  }

  const answer = path.match(/\/podcast\/([^/]+)\/answer$/);
  if (answer && event.httpMethod === "POST") {
    return kernelFetch(`/podcast/${answer[1]}/answer`, { method: "POST", body });
  }

  const episode = path.match(/\/podcast\/([^/]+)$/);
  if (episode && event.httpMethod === "GET") {
    return kernelFetch(`/podcast/${episode[1]}`, { method: "GET" });
  }

  return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: "Not found" }) };
};
