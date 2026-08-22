import { KNOWN_ORIGINS } from "./cors";

export const DEFAULT_HUB = "https://knowledge-hub.adam-russell.com/";

export const SESSION_COOKIE =
  "Domain=.adam-russell.com; HttpOnly; Secure; SameSite=Lax; Path=/";

export function loginPageFailurePath(returnTo: string): string {
  const params = new URLSearchParams({ signin: "invalid", return_to: returnTo });
  return `/login.html?${params}`;
}

export function sessionCookie(token: string): string {
  return `kh_session=${token}; ${SESSION_COOKIE}; Max-Age=2592000`;
}

export function headerValue(headers: Record<string, string | undefined> | undefined, name: string): string {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value ?? "";
  }
  return "";
}

export function readBody(body: string | null | undefined, isBase64Encoded?: boolean): string {
  if (!body) return "";
  return isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

export function parseLoginBody(
  body: string,
  contentType: string,
): { passphrase: string; returnTo: string | null; viaForm: boolean } {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    return {
      passphrase: params.get("passphrase") ?? "",
      returnTo: params.get("return_to"),
      viaForm: true,
    };
  }
  try {
    const json = JSON.parse(body || "{}") as { passphrase?: string; return_to?: string };
    return { passphrase: json.passphrase ?? "", returnTo: json.return_to ?? null, viaForm: false };
  } catch {
    return { passphrase: "", returnTo: null, viaForm: false };
  }
}

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!KNOWN_ORIGINS.has(url.origin)) return null;
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function withSignInQuery(href: string, code: "invalid" | "error"): string {
  const url = new URL(href);
  url.searchParams.set("signin", code);
  return url.href;
}

export function cleanReturnTo(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("signin");
  return url.href;
}
