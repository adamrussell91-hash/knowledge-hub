const DEFAULT_PRODUCTION_API_BASE = "https://api.adam-russell.com/api/knowledge";
const DEFAULT_LEGACY_API_BASE = "https://knowledge-api.adam-russell.com/api";
export const DEFAULT_PRODUCTION_TIDY_ORIGIN = "https://knowledge-tidy.adam-russell.com";

export const PRODUCTION_API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_PRODUCTION_API_BASE;

export const LEGACY_API_BASE =
  (import.meta.env.VITE_LEGACY_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_LEGACY_API_BASE;

const LOCAL_HOSTNAME_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function resolveApiBase(
  hostname = typeof location === "undefined" ? "localhost" : location.hostname,
): string {
  if (LOCAL_HOSTNAME_RE.test(hostname)) return "/api";
  return PRODUCTION_API_BASE;
}

export function resolveLegacyApiBase(
  hostname = typeof location === "undefined" ? "localhost" : location.hostname,
): string {
  if (LOCAL_HOSTNAME_RE.test(hostname)) return "/api";
  return LEGACY_API_BASE;
}

export const API_BASE = resolveApiBase();
export const LEFTOVER_API_BASE = resolveLegacyApiBase();
