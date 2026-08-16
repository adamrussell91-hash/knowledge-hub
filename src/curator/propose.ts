import type { Page } from "../domain/page";
import type { VectorHit } from "./candidates";
import { RELATIONS, type Relation } from "./schema";

export type JudgedLink = {
  pageId: string;
  related: boolean;
  relation: Relation;
  rationale: string;
};

export function buildProposePrompt(note: Page, candidates: VectorHit[]) {
  const list = candidates
    .map(
      (hit, index) =>
        `[${index + 1}] id:${hit.pageId} title:${hit.title}\n${hit.excerpt}`,
    )
    .join("\n\n");
  return `You are proposing links in a personal knowledge archive. Return JSON only.

Source note id:${note.id} title:${note.title}
${note.body.slice(0, 4000)}

Candidates:
${list || "(none)"}

Return only JSON:
{
  "proposals": [
    {
      "pageId": "one of the candidate ids",
      "related": true,
      "relation": "related" | "builds-on" | "contrasts-with",
      "rationale": "one short sentence"
    }
  ]
}

related:false means skip. Do not invent page ids. Empty proposals if nothing is genuinely related.`;
}

export function parseJudgements(raw: string, allowedIds: Set<string>): JudgedLink[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as { proposals?: unknown };
    if (!Array.isArray(parsed.proposals)) return [];
    return parsed.proposals.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const row = item as { pageId?: unknown; related?: unknown; relation?: unknown; rationale?: unknown };
      if (typeof row.pageId !== "string" || !allowedIds.has(row.pageId)) return [];
      if (row.related !== true) return [];
      const relation = RELATIONS.includes(row.relation as Relation) ? (row.relation as Relation) : "related";
      const rationale = typeof row.rationale === "string" ? row.rationale : "";
      return [{ pageId: row.pageId, related: true, relation, rationale }];
    });
  } catch {
    return [];
  }
}

export async function judgeLinks(input: {
  note: Page;
  candidates: VectorHit[];
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<JudgedLink[]> {
  if (!input.candidates.length) return [];
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model ?? "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: buildProposePrompt(input.note, input.candidates) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = payload.content?.find(block => block.type === "text")?.text ?? "";
  return parseJudgements(text, new Set(input.candidates.map(hit => hit.pageId)));
}
