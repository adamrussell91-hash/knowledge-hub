export function loginFormAction(apiBase: string, useLocalData: boolean): string | null {
  if (useLocalData) return null;
  return `${apiBase.replace(/\/$/, "")}/auth-login`;
}

export function signInErrorMessage(code: string | null): string | null {
  if (code === "invalid") return "Invalid passphrase";
  if (code === "error") return "Unable to sign in. Please try again.";
  return null;
}

export function takeSignInQuery(href: string): { message: string | null; nextUrl: string } {
  const url = new URL(href);
  const message = signInErrorMessage(url.searchParams.get("signin"));
  url.searchParams.delete("signin");
  return { message, nextUrl: `${url.pathname}${url.search}${url.hash}` };
}
