export class GitHubWriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const api = (repo: string, file: string) =>
  `https://api.github.com/repos/${repo}/contents/${file}`;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

export async function getContent(
  repo: string,
  token: string,
  file: string,
): Promise<{ sha: string; text: string } | null> {
  let response: Response;
  try {
    response = await fetch(api(repo, file), { headers: headers(token) });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? String(error.cause) : String(error);
    throw new GitHubWriteError(`GitHub network error: ${cause}`, 502);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubWriteError(`GitHub data repo error ${response.status}: ${file}`, response.status);
  const payload = (await response.json()) as {
    sha?: string;
    content?: string;
    encoding?: string;
    size?: number;
  };
  if (!payload.sha) throw new GitHubWriteError(`GitHub data repo error: ${file} is not a file`, 502);
  let text =
    payload.encoding === "base64" && payload.content
      ? Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8")
      : "";
  // Contents JSON omits `content` over 1MB. manifest.json is ~1.8MB, so boot
  // used to get empty text, fail JSON.parse, and look like a sign-in failure.
  if (!text && (payload.size ?? 0) > 0) {
    let blob: Response;
    try {
      blob = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${payload.sha}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw" },
      });
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? String(error.cause) : String(error);
      throw new GitHubWriteError(`GitHub network error: ${cause}`, 502);
    }
    if (!blob.ok) throw new GitHubWriteError(`GitHub data repo error ${blob.status}: ${file}`, blob.status);
    text = await blob.text();
  }
  if ((payload.size ?? 0) > 0 && !text) {
    throw new GitHubWriteError(`GitHub returned empty content for ${file}`, 502);
  }
  return { sha: payload.sha, text };
}

export async function putContent(
  repo: string,
  token: string,
  file: string,
  text: string,
  sha: string | undefined,
  message = `Save ${file}`,
) {
  let response: Response;
  try {
    response = await fetch(api(repo, file), {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify({
        message,
        content: Buffer.from(text).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? String(error.cause) : String(error);
    throw new GitHubWriteError(`GitHub network error: ${cause}`, 502);
  }
  if (!response.ok) {
    throw new GitHubWriteError(`GitHub data repo error ${response.status}: ${file}`, response.status);
  }
}
