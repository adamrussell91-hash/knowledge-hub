// Host-only cookie, same attributes as Life Hub and Teaching Hub.
// Domain=.adam-russell.com made iPhone Safari drop the session.
export const SESSION_COOKIE = "Path=/; Secure; HttpOnly; SameSite=None";

export function sessionCookie(token: string): string {
  return `kh_session=${token}; Max-Age=2592000; ${SESSION_COOKIE}`;
}

export function expiredSessionCookie(): string {
  return `kh_session=; Max-Age=0; ${SESSION_COOKIE}`;
}
