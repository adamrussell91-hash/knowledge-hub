import type { Handler } from "@netlify/functions";
import { PageSchema, type Page } from "../../src/domain/page";
import { approveProposal, dismissProposal } from "../../src/curator/apply";
import { DismissedPairSchema, PendingProposalSchema, type DismissedPair, type PendingProposal } from "../../src/curator/schema";
import { cors, preflight } from "./_lib/cors";
import { getContent, GitHubWriteError, putContent } from "./_lib/githubWrite";
import { requireSession } from "./_lib/requireSession";

const PENDING = "_curator/pending-proposals.json";
const DISMISSED = "_curator/dismissed.json";

export async function dispatchCurator(input: {
  repo: string;
  token: string;
  fetchImpl?: typeof fetch;
  ref?: string;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.github.com/repos/${input.repo}/actions/workflows/curator.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: input.ref ?? "main" }),
    },
  );
  if (!response.ok && response.status !== 204) {
    throw new GitHubWriteError(`workflow dispatch failed ${response.status}`, response.status);
  }
}

function parseList<T>(text: string, parseOne: (item: unknown) => T): T[] {
  try {
    const raw = JSON.parse(text) as unknown;
    return Array.isArray(raw)
      ? raw.flatMap(item => {
          try {
            return [parseOne(item)];
          } catch {
            return [];
          }
        })
      : [];
  } catch {
    return [];
  }
}

async function loadQueue(
  get: (file: string) => Promise<{ sha: string; text: string } | null>,
) {
  const [pendingFile, dismissedFile] = await Promise.all([get(PENDING), get(DISMISSED)]);
  return {
    pending: pendingFile ? parseList(pendingFile.text, item => PendingProposalSchema.parse(item)) : [],
    pendingSha: pendingFile?.sha,
    dismissed: dismissedFile ? parseList(dismissedFile.text, item => DismissedPairSchema.parse(item)) : [],
    dismissedSha: dismissedFile?.sha,
  };
}

async function readPage(
  get: (file: string) => Promise<{ sha: string; text: string } | null>,
  id: string,
): Promise<{ page: Page; sha: string } | null> {
  const file = await get(`pages/${id}.json`);
  if (!file) return null;
  const parsed = PageSchema.safeParse(JSON.parse(file.text));
  if (!parsed.success) return null;
  return { page: parsed.data, sha: file.sha };
}

export const handler: Handler = async event => {
  const pre = preflight(event);
  if (pre) return pre;
  const denied = requireSession(event);
  if (denied) return denied;
  const repo = process.env.GITHUB_DATA_REPO;
  const token = process.env.GITHUB_DATA_REPO_TOKEN;
  if (!repo || !token) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Data repo is not configured" }) };
  }
  const get = (file: string) => getContent(repo, token, file);
  const put = (file: string, text: string, sha?: string, message?: string) =>
    putContent(repo, token, file, text, sha, message);

  try {
    if (event.httpMethod === "GET") {
      const { pending } = await loadQueue(get);
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ pending }) };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
    }
    let raw: { action?: string; id?: string } = {};
    try {
      raw = JSON.parse(event.body ?? "{}") as { action?: string; id?: string };
    } catch {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
    }
    const action = raw.action;
    if (action === "run") {
      const codeRepo = process.env.GITHUB_CODE_REPO ?? "adamrussell91-hash/knowledge-hub";
      const dispatchToken = process.env.GITHUB_WORKFLOW_TOKEN ?? token;
      await dispatchCurator({ repo: codeRepo, token: dispatchToken });
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ status: "queued" }) };
    }

    const queue = await loadQueue(get);
    const ids =
      action === "approve-all"
        ? queue.pending.map(item => item.id)
        : action === "dismiss-all"
          ? queue.pending.map(item => item.id)
          : raw.id
            ? [raw.id]
            : [];
    if (!ids.length || (action !== "approve" && action !== "dismiss" && action !== "approve-all" && action !== "dismiss-all")) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Unknown action" }) };
    }

    let pending = queue.pending;
    let dismissed = queue.dismissed;
    const now = new Date().toISOString();
    for (const id of ids) {
      if (action === "approve" || action === "approve-all") {
        const item = pending.find(row => row.id === id);
        if (!item) continue;
        const [left, right] = await Promise.all([readPage(get, item.noteA), readPage(get, item.noteB)]);
        if (!left || !right) continue;
        const result = approveProposal(pending, left.page, right.page, id);
        if (!result) continue;
        pending = result.pending;
        await put(`pages/${result.pageA.id}.json`, JSON.stringify(result.pageA), left.sha, `Link ${result.pageA.id}`);
        await put(`pages/${result.pageB.id}.json`, JSON.stringify(result.pageB), right.sha, `Link ${result.pageB.id}`);
      } else {
        const result = dismissProposal(pending, dismissed, id, now);
        if (!result) continue;
        pending = result.pending;
        dismissed = result.dismissed;
      }
    }
    await put(PENDING, JSON.stringify(pending), queue.pendingSha, "Update curator pending");
    await put(DISMISSED, JSON.stringify(dismissed), queue.dismissedSha, "Update curator dismissed");
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ pending }) };
  } catch (error) {
    const status = error instanceof GitHubWriteError ? (error.status === 409 ? 409 : 502) : 502;
    const message = error instanceof Error ? error.message : "Curator failed";
    return { statusCode: status, headers: cors(), body: JSON.stringify({ error: message }) };
  }
};
