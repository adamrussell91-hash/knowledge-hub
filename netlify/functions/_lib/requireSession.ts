import type { HandlerEvent, HandlerResponse } from "@netlify/functions";
import { verifySession } from "./session";
export function requireSession(event: HandlerEvent): HandlerResponse | null { const value = event.headers.cookie?.match(/kh_session=([^;]+)/)?.[1]; if (!value || !process.env.SESSION_SECRET) return { statusCode: 401, body: JSON.stringify({ error: "Unauthenticated" }) }; try { verifySession(value, process.env.SESSION_SECRET); return null; } catch { return { statusCode: 401, body: JSON.stringify({ error: "Unauthenticated" }) }; } }
