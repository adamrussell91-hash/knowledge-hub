import type { Attachment, Page, PageManifestEntry } from "../domain/page";
import type { ResearchResult } from "../research/schema";
import { API_BASE, PRODUCTION_API_BASE } from "./config";
import { localGetPage, localListPages, localSearchPages } from "./localData";

export const USE_LOCAL_DATA =
  import.meta.env.VITE_USE_LOCAL_DATA === "true" ||
  (Boolean(import.meta.env.DEV) && import.meta.env.MODE !== "test");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    let detail = `API error ${response.status}: ${path}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) detail = payload.error;
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const listPages = (): Promise<PageManifestEntry[]> =>
  USE_LOCAL_DATA ? localListPages() : apiFetch<PageManifestEntry[]>("/pages");

export const getPage = (id: string): Promise<Page> =>
  USE_LOCAL_DATA ? localGetPage(id) : apiFetch<Page>(`/pages/${encodeURIComponent(id)}`);

export const searchPages = (query: string): Promise<PageManifestEntry[]> =>
  USE_LOCAL_DATA
    ? localSearchPages(query)
    : apiFetch<PageManifestEntry[]>(`/search?q=${encodeURIComponent(query)}`);

export async function getAttachmentUrl(
  pageId: string,
  attachmentId: string,
): Promise<{ url: string }> {
  if (USE_LOCAL_DATA) {
    throw new Error("Signed downloads need the Netlify API — local preview shows the attachment UI only.");
  }
  return apiFetch<{ url: string }>(
    `/attachments/${encodeURIComponent(pageId)}/${encodeURIComponent(attachmentId)}`,
  );
}

export async function fetchSession(): Promise<boolean> {
  if (USE_LOCAL_DATA) return true;
  const response = await fetch(`${API_BASE}/auth-session`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return false;
  try {
    const payload = (await response.json()) as { authenticated?: boolean };
    return payload.authenticated === true;
  } catch {
    return false;
  }
}

export async function login(passphrase: string): Promise<boolean> {
  if (USE_LOCAL_DATA) return true;
  const response = await fetch(`${API_BASE}/auth-login`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  return response.ok;
}

export async function logout(): Promise<void> {
  if (USE_LOCAL_DATA) return;
  await fetch(`${API_BASE}/auth-logout`, { method: "POST", credentials: "include" });
}

export type CoachMessage = { role: "user" | "assistant"; content: string };

export type CoachResult = {
  reply: string;
  research?: ResearchResult;
  archiveFailed?: boolean;
};

export async function runCoach(input: {
  messages: CoachMessage[];
  workingThesis?: string;
  draft?: string;
}): Promise<CoachResult> {
  return apiFetch<CoachResult>("/clementine-coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type ChatRequest = {
  messages: CoachMessage[];
  hat: string;
  scope?: string;
  depth?: string;
  workingThesis?: string;
  draft?: string;
  noteContext?: { pageId: string; title: string };
  searchOutside?: boolean;
  researchSessionId?: string;
  compose?: boolean;
  priorResearch?: ResearchResult;
  archiveFailed?: boolean;
};

type ChatResponse = {
  status: "done" | "researching" | "compose" | "external-unavailable";
  reply?: string;
  research?: ResearchResult;
  archiveFailed?: boolean;
  coverage?: { distinctSources: number; gapCount: number; thin: boolean };
  canSearchOutside?: boolean;
  researchSessionId?: string;
  reason?: string;
};

export type ChatPhase = {
  status: "searching" | "compose" | "researching" | "writing";
  research?: ResearchResult;
  archiveFailed?: boolean;
};

async function postChat(input: ChatRequest) {
  return apiFetch<ChatResponse>("/clementine-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function runChat(input: ChatRequest, onPhase?: (phase: ChatPhase) => void) {
  if (USE_LOCAL_DATA) {
    throw new Error("Chat needs the live API (npx netlify dev).");
  }
  try {
    onPhase?.({ status: "searching" });
    const result = await postChat(input);
    if (result.status === "compose") {
      onPhase?.({ status: "compose", research: result.research, archiveFailed: result.archiveFailed });
      onPhase?.({ status: "writing", research: result.research, archiveFailed: result.archiveFailed });
      return postChat({
        ...input,
        compose: true,
        priorResearch: result.research,
        archiveFailed: result.archiveFailed,
      });
    }
    if (result.status === "researching") {
      onPhase?.({ status: "researching", research: result.research });
    }
    return result;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Chat timed out. Send the same message again.");
    }
    throw error;
  }
}

export const PODCAST_NEEDS_NETLIFY = "Podcast needs the Netlify API";

function podcastPost<T>(path: string, body: unknown) {
  if (USE_LOCAL_DATA) throw new Error(PODCAST_NEEDS_NETLIFY);
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function startPodcast(body: unknown) {
  return podcastPost("/podcast/start", body);
}

export function startPodcastSeries(body: unknown) {
  return podcastPost("/podcast/series/start", body);
}

export function nextPodcastEpisode(seriesId: string) {
  return podcastPost(`/podcast/series/${encodeURIComponent(seriesId)}/next`, {});
}

export function listPodcasts() {
  if (USE_LOCAL_DATA) throw new Error(PODCAST_NEEDS_NETLIFY);
  return apiFetch("/podcast");
}

export function getPodcast(episodeId: string) {
  if (USE_LOCAL_DATA) throw new Error(PODCAST_NEEDS_NETLIFY);
  return apiFetch(`/podcast/${encodeURIComponent(episodeId)}`);
}

export function interruptPodcast(episodeId: string, body: unknown) {
  return podcastPost(`/podcast/${encodeURIComponent(episodeId)}/interrupt`, body);
}

export function answerPodcastQuiz(episodeId: string, body: unknown) {
  return podcastPost(`/podcast/${encodeURIComponent(episodeId)}/answer`, body);
}

export function getPodcastAudioUrl(episodeId: string, turnId: string) {
  if (USE_LOCAL_DATA) throw new Error(PODCAST_NEEDS_NETLIFY);
  return apiFetch<{ url: string }>(
    `/podcast/${encodeURIComponent(episodeId)}/audio/${encodeURIComponent(turnId)}`,
  );
}

export async function savePage(page: Page): Promise<Page> {
  if (USE_LOCAL_DATA) {
    throw new Error("Saving needs the live API (netlify dev or production).");
  }
  return apiFetch<Page>("/pages-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(page),
  });
}

export function tidyEndpoint(localData: boolean) {
  return localData ? "/local-data/tidy" : `${PRODUCTION_API_BASE}/tidy`;
}

async function readTidyError(response: Response) {
  let detail = `Tidy failed (${response.status})`;
  try {
    detail = ((await response.json()) as { error?: string }).error ?? detail;
  } catch {
    /* retain status */
  }
  return detail;
}

async function pageIfAlreadyTidied(id: string, previousUpdatedAt: string) {
  const page = await getPage(id);
  if (page.updated_at !== previousUpdatedAt) return page;
  return null;
}

export async function tidyPage(id: string, previousUpdatedAt?: string): Promise<Page> {
  const endpoint = tidyEndpoint(USE_LOCAL_DATA);
  const before = previousUpdatedAt ?? (USE_LOCAL_DATA ? "" : (await getPage(id)).updated_at);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (error) {
    const recovered = before ? await pageIfAlreadyTidied(id, before).catch(() => null) : null;
    if (recovered) return recovered;
    if (error instanceof TypeError) throw new Error("Clean up timed out. Refresh the note — it may already be cleaned up.");
    throw error;
  }
  if (response.status === 202) {
    const recovered = before ? await pageIfAlreadyTidied(id, before) : null;
    if (recovered) return recovered;
    throw new Error("Clean up is still running. Refresh the note in a few seconds.");
  }
  if (!response.ok) throw new Error(await readTidyError(response));
  return response.json() as Promise<Page>;
}

export type SignAttachmentInput = {
  filename: string;
  content_type: string;
  byte_size: number;
  page_id: string;
  area: Page["area"];
};

export async function signAttachment(
  input: SignAttachmentInput,
): Promise<{ put_url: string; attachment: Attachment }> {
  if (USE_LOCAL_DATA) {
    throw new Error("Uploads need the live API (netlify dev or production).");
  }
  return apiFetch<{ put_url: string; attachment: Attachment }>("/attachments-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function uploadSignedFile(putUrl: string, file: File, contentType: string) {
  const response = await fetch(putUrl, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
}
