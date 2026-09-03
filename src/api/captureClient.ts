import { USE_LOCAL_DATA } from "./client";
import { API_BASE } from "./config";
import { readApiError, unwrapApiPayload } from "./envelope";

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
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(readApiError(payload, response.status, "/capture"));
  return unwrapApiPayload<{ text: string }>(payload);
}
