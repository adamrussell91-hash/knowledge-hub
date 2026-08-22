import { assembleClementinePrompt } from "../clementine/assemble";
import { topicQuery } from "../research/topicQuery";
import { ResearchResultSchema, type ResearchResult } from "../research/schema";
import { coverageFromResearch, type CoverageRead } from "./coverage";
import { resolveChatPlan, type ChatDepth, type ChatHatId, type ChatScope } from "./hats";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatKernel = {
  url: string;
  secret: string;
  fetchImpl: typeof fetch;
};

export type ArchivePull = (input: { query: string; k: number; tags?: string[] }) => Promise<ResearchResult>;

export type ChatTurnInput = {
  voice: string;
  universityJob: string;
  hat: ChatHatId;
  scope?: ChatScope;
  depth?: ChatDepth;
  messages: ChatMessage[];
  workingThesis?: string;
  draft?: string;
  noteContext?: { pageId: string; title: string };
  searchOutside?: boolean;
  researchSessionId?: string;
  compose?: boolean;
  priorResearch?: ResearchResult;
  archiveFailed?: boolean;
  kernel?: ChatKernel;
  archivePull?: ArchivePull;
  complete: (system: string, messages: ChatMessage[]) => Promise<string>;
};

export const KERNEL_BUDGET_MS = 20_000;
export const QUICK_KERNEL_BUDGET_MS = 8_000;
const ARCHIVE_FAILED_NOTE =
  "The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation.";

export type ChatTurnResult =
  | { status: "researching"; researchSessionId: string; research?: ResearchResult }
  | { status: "compose"; research?: ResearchResult; archiveFailed?: boolean; coverage?: CoverageRead }
  | { status: "external-unavailable"; reason: string }
  | {
      status: "done";
      reply: string;
      research?: ResearchResult;
      archiveFailed?: boolean;
      coverage?: CoverageRead;
      canSearchOutside?: boolean;
    };

type ArchivePack = { research?: ResearchResult; archiveFailed?: boolean; note: string };

function lastUserQuery(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i]!.content;
  }
  return "";
}

function searchBody(input: ChatTurnInput) {
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  const raw = lastUserQuery(input.messages) || "working thesis";
  return {
    query: topicQuery(raw) || raw,
    documentContext: documentContext(input),
    k: plan.k,
    tags: plan.tags,
    maxRounds: plan.maxRounds,
    negation: plan.negation,
  };
}

function documentContext(input: ChatTurnInput): string | undefined {
  const parts = [
    input.workingThesis?.trim(),
    input.draft?.trim(),
    input.noteContext ? `Open note: ${input.noteContext.title} (${input.noteContext.pageId})` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

function failedArchive(): ArchivePack {
  return { archiveFailed: true, note: ARCHIVE_FAILED_NOTE };
}

async function kernelFetch(kernel: ChatKernel, path: string, init?: RequestInit): Promise<Response> {
  const base = kernel.url.replace(/\/+$/, "");
  return kernel.fetchImpl(`${base}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(KERNEL_BUDGET_MS),
    headers: {
      "Content-Type": "application/json",
      "x-research-kernel-secret": kernel.secret,
      ...(init?.headers ?? {}),
    },
  });
}

async function pullLive(input: ChatTurnInput): Promise<ResearchResult | null> {
  if (!input.archivePull) return null;
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  try {
    return await input.archivePull({
      query: lastUserQuery(input.messages) || "working thesis",
      k: plan.k,
      tags: plan.tags,
    });
  } catch {
    return null;
  }
}

function preferLive(kernel: ArchivePack, live: ResearchResult | null): ArchivePack {
  if (kernel.research?.findings.length && !kernel.archiveFailed) return kernel;
  if (live?.findings.length) return archiveNote(live);
  if (live) return archiveNote(live);
  return kernel.research || kernel.archiveFailed || kernel.note ? kernel : failedArchive();
}

async function pullQuick(input: ChatTurnInput): Promise<ArchivePack> {
  if (!input.kernel) return { note: "" };
  try {
    const response = await kernelFetch(input.kernel, "/quick_research", {
      method: "POST",
      body: JSON.stringify(searchBody(input)),
      signal: AbortSignal.timeout(QUICK_KERNEL_BUDGET_MS),
    });
    if (!response.ok) return failedArchive();
    const parsed = ResearchResultSchema.safeParse(await response.json());
    if (!parsed.success) return failedArchive();
    return archiveNote(parsed.data);
  } catch {
    return failedArchive();
  }
}

async function resolveArchive(input: ChatTurnInput): Promise<ArchivePack> {
  const livePromise = pullLive(input);
  const kernel = await pullQuick(input);
  if (kernel.research?.findings.length && !kernel.archiveFailed) {
    await livePromise;
    return kernel;
  }
  return preferLive(kernel, await livePromise);
}

function archiveNote(research: ResearchResult): ArchivePack {
  if (!research.findings.length) {
    const gaps = research.gaps.length ? research.gaps.join("; ") : "none named";
    return {
      research,
      note: `The archive did not give you anything usable. Name the gaps (${gaps}). Do not say "no results found."`,
    };
  }
  return {
    research,
    note: `Archive findings (cite these; never invent pages):\n${JSON.stringify(research.findings, null, 2)}`,
  };
}

function composeFrom(archive: ArchivePack): ChatTurnResult {
  return {
    status: "compose",
    research: archive.research,
    archiveFailed: archive.archiveFailed,
    coverage: archive.research ? coverageFromResearch(archive.research) : undefined,
  };
}

async function startDeep(input: ChatTurnInput): Promise<ChatTurnResult> {
  if (input.kernel) {
    try {
      const response = await kernelFetch(input.kernel, "/deep_research/start", {
        method: "POST",
        body: JSON.stringify(searchBody(input)),
      });
      if (response.ok) {
        const payload = (await response.json()) as { sessionId?: string; result?: ResearchResult };
        if (payload.sessionId) {
          const research = ResearchResultSchema.safeParse(payload.result).data;
          return { status: "researching", researchSessionId: payload.sessionId, research };
        }
      }
    } catch {
      /* live archive below */
    }
  }
  return composeFrom(await resolveArchive({ ...input, kernel: undefined }));
}

async function pollDeep(input: ChatTurnInput): Promise<ArchivePack & { researching?: string }> {
  if (!input.kernel || !input.researchSessionId) return preferLive(failedArchive(), await pullLive(input));
  try {
    const response = await kernelFetch(input.kernel, `/deep_research/${encodeURIComponent(input.researchSessionId)}`);
    if (!response.ok) return preferLive(failedArchive(), await pullLive(input));
    const parsed = ResearchResultSchema.safeParse(await response.json());
    if (!parsed.success) return preferLive(failedArchive(), await pullLive(input));
    if (parsed.data.status === "running") {
      return { researching: input.researchSessionId, research: parsed.data, note: "" };
    }
    if (parsed.data.status === "error" || parsed.data.status === "cancelled") {
      return preferLive({ ...failedArchive(), research: parsed.data }, await pullLive(input));
    }
    if (parsed.data.findings.length) return archiveNote(parsed.data);
    return preferLive(archiveNote(parsed.data), await pullLive(input));
  } catch {
    return preferLive(failedArchive(), await pullLive(input));
  }
}

async function completeTurn(input: ChatTurnInput, archive: ArchivePack): Promise<ChatTurnResult> {
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  const query = lastUserQuery(input.messages);
  const coverage = archive.research ? coverageFromResearch(archive.research) : undefined;
  const system = assembleClementinePrompt({
    voice: input.voice,
    job: input.universityJob,
    surface: `This turn is the Knowledge Hub Chat sitting. Hat: ${plan.hat.label}. Scope: ${plan.scope}. Depth: ${plan.depth}.\n${plan.hat.plan}\n${archive.note}`,
    payload: [
      input.workingThesis?.trim() ? `Working thesis:\n${input.workingThesis.trim()}` : "",
      input.draft?.trim() ? `Draft excerpt:\n${input.draft.trim()}` : "",
      input.noteContext ? `Using open note: ${input.noteContext.title} (${input.noteContext.pageId})` : "",
      query ? `Latest question:\n${query}` : "",
      coverage ? `Coverage: ${coverage.distinctSources} distinct sources, ${coverage.gapCount} gaps, ${coverage.thin ? "thin" : "enough"}.` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const reply = await input.complete(system, input.messages);
  return {
    status: "done",
    reply,
    research: archive.research,
    archiveFailed: archive.archiveFailed,
    coverage,
    canSearchOutside: input.hat === "internalExternal" && Boolean(coverage?.thin),
  };
}

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  assembleClementinePrompt({
    voice: input.voice,
    job: input.universityJob,
    surface: "chat",
    payload: "validate",
  });
  if (input.searchOutside) {
    return {
      status: "external-unavailable",
      reason: "External search is not connected. Brave is not on the research kernel yet. Archive citations stay archive-only.",
    };
  }
  if (input.compose) {
    if (input.priorResearch?.findings.length) {
      return completeTurn(input, {
        ...archiveNote(input.priorResearch),
        archiveFailed: input.archiveFailed,
        note: input.archiveFailed ? ARCHIVE_FAILED_NOTE : archiveNote(input.priorResearch).note,
      });
    }
    if (input.priorResearch && !input.archiveFailed) {
      const recovered = await pullLive(input);
      if (recovered?.findings.length) return completeTurn(input, archiveNote(recovered));
      return completeTurn(input, archiveNote(input.priorResearch));
    }
    const recovered = await pullLive(input);
    if (recovered?.findings.length) return completeTurn(input, archiveNote(recovered));
    return completeTurn(input, recovered ? archiveNote(recovered) : failedArchive());
  }
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  if (input.researchSessionId) {
    const archive = await pollDeep(input);
    if (archive.researching) {
      return { status: "researching", researchSessionId: archive.researching, research: archive.research };
    }
    return completeTurn(input, archive);
  }
  if (plan.kernel === "deep") {
    return startDeep(input);
  }
  return composeFrom(await resolveArchive(input));
}
