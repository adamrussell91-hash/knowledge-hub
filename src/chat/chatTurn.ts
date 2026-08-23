import { assembleClementinePrompt } from "../clementine/assemble";
import { topicQuery } from "../research/topicQuery";
import { ResearchResultSchema, type ResearchResult } from "../research/schema";
import { compactArchiveNote, compactSittingNote } from "./archiveNote";
import { coverageFromResearch, type CoverageRead } from "./coverage";
import { resolveChatPlan, type ChatDepth, type ChatHatId, type ChatScope } from "./hats";
import type { ChatMessage } from "./messages";
import type { ChatWriteState } from "./writeHttp";

export type { ChatMessage } from "./messages";

export type ChatKernel = {
  url: string;
  secret: string;
  fetchImpl: typeof fetch;
};

export type ArchivePull = (input: { query: string; k: number; tags?: string[] }) => Promise<ResearchResult>;

export type ChatWriteClock = {
  start: (input: {
    system: string;
    messages: ChatMessage[];
    maxTokens?: number;
    research?: ResearchResult;
    archiveFailed?: boolean;
  }) => Promise<ChatWriteState>;
  poll: (writeSessionId: string) => Promise<ChatWriteState | null>;
};

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
  notesInPlay?: { pageId: string; title: string }[];
  searchOutside?: boolean;
  researchSessionId?: string;
  writeSessionId?: string;
  compose?: boolean;
  priorResearch?: ResearchResult;
  sittingLibrary?: ResearchResult;
  archiveFailed?: boolean;
  kernel?: ChatKernel;
  archivePull?: ArchivePull;
  write?: ChatWriteClock;
  complete?: (system: string, messages: ChatMessage[]) => Promise<string>;
};

export const NOTE_EDIT_PROTOCOL = `You can edit archive notes when Adam asks in natural language (retag this, swap that tag, drop this tag). Never claim a write already happened. If you intend a tag change, append exactly one fenced block after your prose:

\`\`\`note-edit
{"action":"retag","pageId":"page_…","title":"Exact note title","tags":["Closed list tag"]}
\`\`\`

tags must be from the closed topic vocabulary, at most three. pageId must be a real archive id from this sitting or the notes in play. If you cannot identify the note or the closed-list tags, ask; do not emit a block.`;

export const KERNEL_BUDGET_MS = 20_000;
export const QUICK_KERNEL_BUDGET_MS = 8_000;
export const START_KERNEL_BUDGET_MS = 8_000;
const ARCHIVE_FAILED_NOTE =
  "The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation.";

export type ChatTurnResult =
  | { status: "researching"; researchSessionId: string; research?: ResearchResult }
  | { status: "writing"; writeSessionId: string; research?: ResearchResult; archiveFailed?: boolean; coverage?: CoverageRead }
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

function notesInPlay(input: ChatTurnInput) {
  if (input.notesInPlay?.length) return input.notesInPlay;
  return input.noteContext ? [input.noteContext] : [];
}

function notesLine(input: ChatTurnInput, prefix: string) {
  const notes = notesInPlay(input);
  if (!notes.length) return "";
  return `${prefix}${notes.map(note => `${note.title} (${note.pageId})`).join("; ")}`;
}

function documentContext(input: ChatTurnInput): string | undefined {
  const parts = [
    input.workingThesis?.trim(),
    input.draft?.trim(),
    notesLine(input, "Open note: "),
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
  return { research, note: compactArchiveNote(research) };
}

function sittingNote(research: ResearchResult): ArchivePack {
  return { research, note: compactSittingNote(research) };
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
        signal: AbortSignal.timeout(START_KERNEL_BUDGET_MS),
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
  const archive = await resolveArchive({ ...input, kernel: undefined });
  if (input.write) return finishArchive(input, archive);
  return composeFrom(archive);
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

function assembledSystem(input: ChatTurnInput, archive: ArchivePack) {
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  const query = lastUserQuery(input.messages);
  const coverage = archive.research ? coverageFromResearch(archive.research) : undefined;
  return {
    coverage,
    system: assembleClementinePrompt({
      voice: input.voice,
      job: input.universityJob,
      surface: `This turn is the Knowledge Hub Chat sitting. Hat: ${plan.hat.label}. Scope: ${plan.scope}. Depth: ${plan.depth}.\n${plan.hat.plan}\n${NOTE_EDIT_PROTOCOL}\n${archive.note}`,
      payload: [
        input.workingThesis?.trim() ? `Working thesis:\n${input.workingThesis.trim()}` : "",
        input.draft?.trim() ? `Draft excerpt:\n${input.draft.trim()}` : "",
        notesLine(input, "Notes in play: "),
        query ? `Latest question:\n${query}` : "",
        coverage ? `Coverage: ${coverage.distinctSources} distinct sources, ${coverage.gapCount} gaps, ${coverage.thin ? "thin" : "enough"}.` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    }),
  };
}

function writeMaxTokens(input: ChatTurnInput) {
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  return plan.kernel === "deep" ? 2000 : 1200;
}

async function startWrite(input: ChatTurnInput, archive: ArchivePack): Promise<ChatTurnResult> {
  const { system, coverage } = assembledSystem(input, archive);
  if (input.write) {
    const started = await input.write.start({
      system,
      messages: input.messages,
      maxTokens: writeMaxTokens(input),
      research: archive.research,
      archiveFailed: archive.archiveFailed,
    });
    return {
      status: "writing",
      writeSessionId: started.writeSessionId,
      research: archive.research ?? started.research,
      archiveFailed: archive.archiveFailed,
      coverage,
    };
  }
  if (!input.complete) {
    throw new Error("Chat write clock is not configured");
  }
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

async function pollWrite(input: ChatTurnInput): Promise<ChatTurnResult> {
  if (!input.write || !input.writeSessionId) {
    return { status: "external-unavailable", reason: "Chat write clock is not configured" };
  }
  const state = await input.write.poll(input.writeSessionId);
  if (!state) return { status: "external-unavailable", reason: "Unknown write session" };
  if (state.status === "writing") {
    return {
      status: "writing",
      writeSessionId: state.writeSessionId,
      research: state.research,
      archiveFailed: state.archiveFailed,
      coverage: state.research ? coverageFromResearch(state.research) : undefined,
    };
  }
  if (state.status === "error" || !state.reply) {
    return {
      status: "done",
      reply: "The Worker write failed. The archive notes from this sitting are still attached.",
      research: state.research,
      archiveFailed: state.archiveFailed,
      coverage: state.research ? coverageFromResearch(state.research) : undefined,
    };
  }
  const coverage = state.research ? coverageFromResearch(state.research) : undefined;
  return {
    status: "done",
    reply: state.reply,
    research: state.research,
    archiveFailed: state.archiveFailed,
    coverage,
    canSearchOutside: input.hat === "internalExternal" && Boolean(coverage?.thin),
  };
}

async function finishArchive(input: ChatTurnInput, archive: ArchivePack): Promise<ChatTurnResult> {
  return startWrite(input, archive);
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
  if (input.writeSessionId) {
    return pollWrite(input);
  }
  if (input.compose) {
    if (input.priorResearch?.findings.length) {
      return finishArchive(input, {
        ...archiveNote(input.priorResearch),
        archiveFailed: input.archiveFailed,
        note: input.archiveFailed ? ARCHIVE_FAILED_NOTE : archiveNote(input.priorResearch).note,
      });
    }
    if (input.priorResearch && !input.archiveFailed) {
      const recovered = await pullLive(input);
      if (recovered?.findings.length) return finishArchive(input, archiveNote(recovered));
      return finishArchive(input, archiveNote(input.priorResearch));
    }
    const recovered = await pullLive(input);
    if (recovered?.findings.length) return finishArchive(input, archiveNote(recovered));
    return finishArchive(input, recovered ? archiveNote(recovered) : failedArchive());
  }
  const plan = resolveChatPlan(input.hat, { scope: input.scope, depth: input.depth });
  if (input.researchSessionId) {
    const archive = await pollDeep(input);
    if (archive.researching) {
      return { status: "researching", researchSessionId: archive.researching, research: archive.research };
    }
    return finishArchive(input, archive);
  }
  if (input.sittingLibrary?.findings.length) {
    return finishArchive(input, sittingNote(input.sittingLibrary));
  }
  if (plan.kernel === "deep") {
    return startDeep(input);
  }
  const archive = await resolveArchive(input);
  if (input.write) return finishArchive(input, archive);
  return composeFrom(archive);
}
