import type { Handler } from "@netlify/functions"; import { cors } from "./_lib/cors"; import { requireSession } from "./_lib/requireSession";
export const handler: Handler = async event => requireSession(event) ? { statusCode: 401, headers: cors(), body: JSON.stringify({ authenticated: false }) } : { statusCode: 200, headers: cors(), body: JSON.stringify({ authenticated: true }) };
