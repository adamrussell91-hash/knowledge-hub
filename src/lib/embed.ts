export const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
export const OPENAI_EMBEDDINGS_MODEL = "text-embedding-3-small";

const DEFAULT_RETRIES = 8;
const QUERY_RETRIES = 1;
export const EMBEDDINGS_TIMEOUT_MS = 30_000;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function waitMs(response: Response | null, attempt: number) {
  const header = response?.headers.get("retry-after") ?? null;
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0 && seconds < 120) {
    return Math.min(60_000, Math.max(20_000, seconds * 1000));
  }
  return Math.min(60_000, Math.max(20_000, 1000 * 2 ** attempt));
}

export async function embedTexts(
  texts: string[],
  apiKey: string,
  options?: { sleep?: (ms: number) => Promise<void>; retries?: number },
): Promise<number[][]> {
  const sleep = options?.sleep ?? delay;
  const retries = options?.retries ?? DEFAULT_RETRIES;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: texts, model: OPENAI_EMBEDDINGS_MODEL }),
        signal: AbortSignal.timeout(EMBEDDINGS_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "TimeoutError" && name !== "AbortError") throw error;
      lastError = new Error(`Embeddings API timed out after ${Math.round(EMBEDDINGS_TIMEOUT_MS / 1000)}s`);
      if (attempt === retries) break;
      await sleep(waitMs(null, attempt));
      continue;
    }
    if (response.ok) {
      const json = (await response.json()) as { data: { embedding: number[]; index: number }[] };
      return [...json.data].sort((left, right) => left.index - right.index).map(item => item.embedding);
    }
    lastError = new Error(`Embeddings API error ${response.status}`);
    if (response.status !== 429 && response.status !== 503) break;
    if (attempt === retries) break;
    await sleep(waitMs(response, attempt));
  }
  throw lastError ?? new Error("Embeddings API error");
}

export async function embedQuery(
  text: string,
  apiKey: string,
  options?: { sleep?: (ms: number) => Promise<void>; retries?: number },
): Promise<number[]> {
  const [vector] = await embedTexts([text], apiKey, { retries: QUERY_RETRIES, ...options });
  if (!vector) throw new Error("Embeddings API returned no vector");
  return vector;
}
