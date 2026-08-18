import type { Handler } from "@netlify/functions";
import { queueCuratorRun } from "./curatorQueue";

export const handler: Handler = async () => {
  const origin = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  const secret = process.env.SESSION_SECRET;
  if (!origin || !secret) {
    return { statusCode: 503, body: JSON.stringify({ error: "Curator run is not configured" }) };
  }
  await queueCuratorRun({ origin, secret });
  return { statusCode: 200, body: JSON.stringify({ status: "queued" }) };
};
