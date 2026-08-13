import { createHmac, timingSafeEqual } from "node:crypto";
export interface SessionPayload { sub: string; iat?: number }
const signature = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");
export function signSession(payload: SessionPayload, secret: string) { const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url"); return `${body}.${signature(body, secret)}`; }
export function verifySession(token: string, secret: string): SessionPayload { const [body, signed] = token.split("."); if (!body || !signed) throw new Error("Malformed session token"); const expected = signature(body, secret); const a = Buffer.from(signed); const b = Buffer.from(expected); if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid session signature"); return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
