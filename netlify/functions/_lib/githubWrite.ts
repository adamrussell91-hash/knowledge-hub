export class GitHubWriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GitHub Contents API refuses create/update above 1 MB. */
export const CONTENTS_PUT_MAX_BYTES = 1_000_000;

const api = (repo: string, file: string) =>
  `https://api.github.com/repos/${repo}/contents/${file}`;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function githubRequest(url: string, token: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: { ...headers(token), ...(init?.headers ?? {}) },
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? String(error.cause) : String(error);
    throw new GitHubWriteError(`GitHub network error: ${cause}`, 502);
  }
}

async function githubJson<T>(url: string, token: string, file: string, init?: RequestInit): Promise<T> {
  const response = await githubRequest(url, token, init);
  if (!response.ok) {
    const status = response.status === 422 && init?.method === "PATCH" ? 409 : response.status;
    throw new GitHubWriteError(`GitHub data repo error ${status}: ${file}`, status);
  }
  return response.json() as Promise<T>;
}

function decodeContents(payload: { content?: string; encoding?: string }) {
  if (payload.encoding === "base64" && payload.content) {
    return Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
  }
  return "";
}

export async function getContent(
  repo: string,
  token: string,
  file: string,
): Promise<{ sha: string; text: string } | null> {
  const response = await githubRequest(api(repo, file), token);
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubWriteError(`GitHub data repo error ${response.status}: ${file}`, response.status);
  const payload = (await response.json()) as {
    sha?: string;
    content?: string;
    encoding?: string;
    size?: number;
  };
  if (!payload.sha) throw new GitHubWriteError(`GitHub data repo error: ${file} is not a file`, 502);
  let text = decodeContents(payload);
  if (!text && (payload.size ?? 0) > 0) {
    const blob = await githubRequest(`https://api.github.com/repos/${repo}/git/blobs/${payload.sha}`, token, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    if (!blob.ok) throw new GitHubWriteError(`GitHub data repo error ${blob.status}: ${file}`, blob.status);
    text = await blob.text();
  }
  if ((payload.size ?? 0) > 0 && !text) {
    throw new GitHubWriteError(`GitHub returned empty content for ${file}`, 502);
  }
  return { sha: payload.sha, text };
}

async function putViaGitData(
  repo: string,
  token: string,
  file: string,
  text: string,
  sha: string | undefined,
  message: string,
) {
  if (sha) {
    const current = await githubRequest(api(repo, file), token);
    if (current.status === 404) throw new GitHubWriteError(`GitHub data repo error 409: ${file}`, 409);
    if (!current.ok) throw new GitHubWriteError(`GitHub data repo error ${current.status}: ${file}`, current.status);
    const meta = (await current.json()) as { sha?: string };
    if (meta.sha !== sha) throw new GitHubWriteError(`GitHub data repo error 409: ${file}`, 409);
  }
  const repoInfo = await githubJson<{ default_branch: string }>(
    `https://api.github.com/repos/${repo}`,
    token,
    file,
  );
  const branch = repoInfo.default_branch;
  const ref = await githubJson<{ object: { sha: string } }>(
    `https://api.github.com/repos/${repo}/git/ref/heads/${branch}`,
    token,
    file,
  );
  const commit = await githubJson<{ tree: { sha: string } }>(
    `https://api.github.com/repos/${repo}/git/commits/${ref.object.sha}`,
    token,
    file,
  );
  const blob = await githubJson<{ sha: string }>(
    `https://api.github.com/repos/${repo}/git/blobs`,
    token,
    file,
    { method: "POST", body: JSON.stringify({ content: text, encoding: "utf-8" }) },
  );
  const tree = await githubJson<{ sha: string }>(
    `https://api.github.com/repos/${repo}/git/trees`,
    token,
    file,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: [{ path: file, mode: "100644", type: "blob", sha: blob.sha }],
      }),
    },
  );
  const next = await githubJson<{ sha: string }>(
    `https://api.github.com/repos/${repo}/git/commits`,
    token,
    file,
    {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
    },
  );
  await githubJson(
    `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`,
    token,
    file,
    { method: "PATCH", body: JSON.stringify({ sha: next.sha }) },
  );
}

export async function putContent(
  repo: string,
  token: string,
  file: string,
  text: string,
  sha: string | undefined,
  message = `Save ${file}`,
) {
  if (Buffer.byteLength(text, "utf8") >= CONTENTS_PUT_MAX_BYTES) {
    await putViaGitData(repo, token, file, text, sha, message);
    return;
  }
  const response = await githubRequest(api(repo, file), token, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(text).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    throw new GitHubWriteError(`GitHub data repo error ${response.status}: ${file}`, response.status);
  }
}
