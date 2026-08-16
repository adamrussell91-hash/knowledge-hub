import { USE_LOCAL_DATA } from "./client";
import { API_BASE } from "./config";

export const CAPTURE_NEEDS_NETLIFY = "Capture needs the live API (netlify dev or production).";

export async function runCapture(
  r2Key: string,
  options: { localData?: boolean } = {},
): Promise<{ text: string }> {
  if (options.localData ?? USE_LOCAL_DATA) {
    throw new Error(CAPTURE_NEEDS_NETLIFY);
  }
  const response = await fetch(`${API_BASE}/capture`, {
    credentials: "include",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ r2_key: r2Key }),
  });
  if (!response.ok) throw new Error(`API error ${response.status}: /capture`);
  return response.json() as Promise<{ text: string }>;
}
