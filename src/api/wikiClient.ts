import type { PendingProposal } from "../curator/schema";
import { USE_LOCAL_DATA } from "./client";
import { API_BASE } from "./config";

export { USE_LOCAL_DATA };

export const WIKI_NEEDS_NETLIFY = "Wiki proposals need the live API (netlify dev or production).";

export type CuratorAction = "approve" | "dismiss" | "approve-all" | "dismiss-all" | "run";

async function wikiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) throw new Error(`API error ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export async function listCuratorPending(): Promise<PendingProposal[]> {
  if (USE_LOCAL_DATA) throw new Error(WIKI_NEEDS_NETLIFY);
  const payload = await wikiFetch<{ pending: PendingProposal[] }>("/curator");
  return payload.pending;
}

export async function curatorAction(
  action: CuratorAction,
  id?: string,
): Promise<{ pending?: PendingProposal[]; status?: string }> {
  if (USE_LOCAL_DATA) throw new Error(WIKI_NEEDS_NETLIFY);
  return wikiFetch<{ pending?: PendingProposal[]; status?: string }>("/curator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, id }),
  });
}
