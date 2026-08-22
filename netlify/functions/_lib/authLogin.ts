// Host-only cookie, same attributes as Life Hub and Teaching Hub.
// Domain=.adam-russell.com made iPhone Safari drop the session.
// Earlier deploys also left SameSite=Lax + Domain= copies in browsers; login
// and logout expire those leftovers so the new host-only cookie can win.
export const SESSION_COOKIE = "Path=/; Secure; HttpOnly; SameSite=None";

export function sessionCookie(token: string): string {
  return `kh_session=${token}; Max-Age=2592000; ${SESSION_COOKIE}`;
}

export function expiredSessionCookies(): string[] {
  const domains = ["", "Domain=.adam-russell.com; "];
  const sites = ["SameSite=None", "SameSite=Lax"];
  const cookies: string[] = [];
  for (const domain of domains) {
    for (const site of sites) {
      cookies.push(`kh_session=; Max-Age=0; Path=/; Secure; HttpOnly; ${domain}${site}`);
    }
  }
  return cookies;
}

export function loginCookies(token: string): string[] {
  return [...expiredSessionCookies(), sessionCookie(token)];
}

export function expiredSessionCookie(): string {
  return expiredSessionCookies()[0] ?? `kh_session=; Max-Age=0; ${SESSION_COOKIE}`;
}
