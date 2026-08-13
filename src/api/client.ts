import type { Page, PageManifestEntry } from "../domain/page";
import { API_BASE } from "./config";
async function apiFetch<T>(path: string): Promise<T> { const response = await fetch(`${API_BASE}${path}`, { credentials: "include" }); if (!response.ok) throw new Error(`API error ${response.status}: ${path}`); return response.json() as Promise<T>; }
export const listPages = () => apiFetch<PageManifestEntry[]>("/pages");
export const getPage = (id: string) => apiFetch<Page>(`/pages/${encodeURIComponent(id)}`);
export const searchPages = (query: string) => apiFetch<PageManifestEntry[]>(`/search?q=${encodeURIComponent(query)}`);
