import type { Handler } from "@netlify/functions";
import { jsonHeaders, preflight, requestOrigin } from "./_lib/cors";
import { createDataRepo } from "./_lib/dataRepo";
import { requireSession } from "./_lib/requireSession";

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  const origin = requestOrigin(event.headers);
  try {
    return {
      statusCode: 200,
      headers: jsonHeaders(origin),
      body: JSON.stringify(await createDataRepo().listManifest()),
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: jsonHeaders(origin),
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Archive failed to load",
      }),
    };
  }
};
