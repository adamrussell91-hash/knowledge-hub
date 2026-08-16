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
  const payload = (await response.json()) as { sha: string; content?: string; encoding?: string };
  const text = payload.encoding === "base64" && payload.content
    ? Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8")
    : "";
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
