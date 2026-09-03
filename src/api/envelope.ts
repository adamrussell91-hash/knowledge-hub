export function readApiError(payload: unknown, status: number, path: string): string {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return `API error ${status}: ${path}`;
}

export function unwrapApiPayload<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "ok" in payload) {
    const envelope = payload as { ok: unknown; data?: T; error?: { message?: string } | string };
    if (envelope.ok === true) return envelope.data as T;
    const message = typeof envelope.error === "string" ? envelope.error : envelope.error?.message;
    throw new Error(message || "Request failed");
  }
  return payload as T;
}

export function searchHits<T>(payload: T[] | { hits?: T[] } | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.hits) ? payload.hits : [];
}

export function sessionAuthenticated(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const body = payload as { authenticated?: unknown; data?: { authenticated?: unknown } };
  return body.authenticated === true || body.data?.authenticated === true;
}

export function sessionTargets(apiBase: string, leftoverBase: string, path: "/auth-login" | "/auth-logout"): string[] {
  return [`${apiBase}${path}`];
}
