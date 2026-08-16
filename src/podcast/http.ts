import type { PodcastEpisode, PodcastSeries } from "./schema";

export type PodcastBindings = {
  secret: string;
  allowedOrigin: string;
  startEpisode: (body: unknown) => Promise<PodcastEpisode>;
  startSeries: (
    body: unknown,
  ) => Promise<{ series: PodcastSeries; episode: PodcastEpisode } | { error: string; status: number }>;
  nextInSeries: (seriesId: string) => Promise<PodcastEpisode | { error: string; status: number }>;
  getEpisode: (id: string) => Promise<PodcastEpisode | null>;
  getSeries: (id: string) => Promise<PodcastSeries | null>;
  listIndex: () => Promise<{ episodes: unknown[]; series: unknown[] }>;
  interrupt: (id: string, body: unknown) => Promise<PodcastEpisode | { error: string; status: number }>;
  answer: (id: string, body: unknown) => Promise<PodcastEpisode | { error: string; status: number }>;
};

function corsHeaders(origin: string | null, allowedOrigin: string) {
  const allow = allowedOrigin === "*" ? origin ?? "*" : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type, x-research-kernel-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isStatusError(value: unknown): value is { error: string; status: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "number"
  );
}

export async function handlePodcastRequest(request: Request, bindings: PodcastBindings): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, bindings.allowedOrigin);
  if (origin && bindings.allowedOrigin !== "*" && origin !== bindings.allowedOrigin) {
    return json(403, { error: "Origin not allowed" }, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!bindings.secret || request.headers.get("x-research-kernel-secret") !== bindings.secret) {
    return json(401, { error: "Unauthorized" }, headers);
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "POST" && path.endsWith("/podcast/start")) {
    try {
      return json(200, await bindings.startEpisode(await readJson(request)), headers);
    } catch (error) {
      return json(502, { error: "Podcast start failed", detail: String(error) }, headers);
    }
  }

  if (request.method === "POST" && path.endsWith("/podcast/series/start")) {
    try {
      const result = await bindings.startSeries(await readJson(request));
      if (isStatusError(result)) return json(result.status, result, headers);
      return json(200, result, headers);
    } catch (error) {
      return json(502, { error: "Series start failed", detail: String(error) }, headers);
    }
  }

  const seriesNext = path.match(/\/podcast\/series\/([^/]+)\/next$/);
  if (request.method === "POST" && seriesNext) {
    try {
      const result = await bindings.nextInSeries(seriesNext[1]);
      if (isStatusError(result)) return json(result.status, result, headers);
      return json(200, result, headers);
    } catch (error) {
      return json(502, { error: "Series next failed", detail: String(error) }, headers);
    }
  }

  const seriesGet = path.match(/\/podcast\/series\/([^/]+)$/);
  if (request.method === "GET" && seriesGet) {
    const series = await bindings.getSeries(seriesGet[1]);
    if (!series) return json(404, { error: "Unknown series" }, headers);
    return json(200, series, headers);
  }

  if (request.method === "GET" && path.endsWith("/podcast/index")) {
    return json(200, await bindings.listIndex(), headers);
  }

  const interruptMatch = path.match(/\/podcast\/([^/]+)\/interrupt$/);
  if (request.method === "POST" && interruptMatch) {
    const result = await bindings.interrupt(interruptMatch[1], await readJson(request));
    if (isStatusError(result)) return json(result.status, result, headers);
    return json(200, result, headers);
  }

  const answerMatch = path.match(/\/podcast\/([^/]+)\/answer$/);
  if (request.method === "POST" && answerMatch) {
    const result = await bindings.answer(answerMatch[1], await readJson(request));
    if (isStatusError(result)) return json(result.status, result, headers);
    return json(200, result, headers);
  }

  const episodeMatch = path.match(/\/podcast\/([^/]+)$/);
  if (request.method === "GET" && episodeMatch) {
    const episode = await bindings.getEpisode(episodeMatch[1]);
    if (!episode) return json(404, { error: "Unknown episode" }, headers);
    return json(200, episode, headers);
  }

  return json(404, { error: "Not found" }, headers);
}
