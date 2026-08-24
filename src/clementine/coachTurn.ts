import { assembleClementinePrompt } from "./assemble";
import { ResearchResultSchema, type ResearchResult } from "../research/schema";

export type CoachMessage = { role: "user" | "assistant"; content: string };

export type CoachTurnInput = {
  voice: string;
  universityJob: string;
  messages: CoachMessage[];
  workingThesis?: string;
  draft?: string;
  kernel?: {
    url: string;
    secret: string;
    fetchImpl: typeof fetch;
  };
  complete: (system: string, messages: CoachMessage[]) => Promise<string>;
};

export type CoachTurnResult = {
  reply: string;
  research?: ResearchResult;
  archiveFailed?: boolean;
};

function lastUserQuery(messages: CoachMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i]!.content;
  }
  return "";
}

function documentContext(input: CoachTurnInput): string | undefined {
  const parts = [input.workingThesis?.trim(), input.draft?.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

async function pullArchive(input: CoachTurnInput): Promise<{ research?: ResearchResult; archiveFailed?: boolean; note: string }> {
  if (!input.kernel) return { note: "" };
  const base = input.kernel.url.replace(/\/+$/, "");
  try {
    const response = await input.kernel.fetchImpl(`${base}/quick_research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-research-kernel-secret": input.kernel.secret,
      },
      body: JSON.stringify({
        query: lastUserQuery(input.messages) || "working thesis",
        documentContext: documentContext(input),
      }),
    });
    if (!response.ok) {
      return { archiveFailed: true, note: "The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation." };
    }
    const parsed = ResearchResultSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { archiveFailed: true, note: "The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation." };
    }
    const research = parsed.data;
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
  } catch {
    return { archiveFailed: true, note: "The archive pull failed. Say so in character and continue with what you have. Do not empty the conversation." };
  }
}

export async function runCoachTurn(input: CoachTurnInput): Promise<CoachTurnResult> {
  assembleClementinePrompt({
    voice: input.voice,
    job: input.universityJob,
    surface: "coach",
    payload: "validate",
  });
  const query = lastUserQuery(input.messages);
  const thesis = input.workingThesis?.trim();
  const draft = input.draft?.trim();
  const archive = await pullArchive(input);
  const system = assembleClementinePrompt({
    voice: input.voice,
    job: input.universityJob,
    surface: `This turn is a Knowledge Hub conversation, not a JSON card list. If he is writing, coach the writing: one primary observation, optionally one secondary. If he is asking a research or practice question, synthesise from the archive. Never refuse a question as the wrong office. Cite notes as [Title](pageId). Never write a raw page id in the answer.\n${archive.note}`,
    payload: [
      thesis ? `Working thesis:\n${thesis}` : "",
      draft ? `Draft excerpt:\n${draft}` : "",
      query ? `Latest question:\n${query}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const reply = await input.complete(system, input.messages);
  return { reply, research: archive.research, archiveFailed: archive.archiveFailed };
}
