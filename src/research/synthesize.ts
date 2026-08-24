import { assembleClementinePrompt } from "../clementine/assemble";
import { university, voice } from "../clementine/pack";
import { ResearchFindingSchema, type ResearchFinding } from "./schema";

export type SynthesisOutput = {
  findings: ResearchFinding[];
  gaps: string[];
  followUpQueries: string[];
};

export type SynthesisSource = {
  pageId: string;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  tags?: string[];
};

export function buildSynthesisPrompt(input: {
  query: string;
  documentContext?: string;
  sources: SynthesisSource[];
}) {
  const sources = input.sources
    .map((source, index) => {
      const tags = source.tags?.length ? `; tags: ${source.tags.join(", ")}` : "";
      return `[${index + 1}] "${source.title}" (id: ${source.pageId}${source.sourceUrl ? `; url: ${source.sourceUrl}` : ""}${tags})\n${source.excerpt}`;
    })
    .join("\n\n");
  const context = input.documentContext?.trim()
    ? `\nDocument / working thesis:\n${input.documentContext.trim()}\n`
    : "";
  return assembleClementinePrompt({
    voice,
    job: university,
    surface: `You are filing a research brief over a personal knowledge archive. Retrieve is already done; your job is critical analysis, not more search. Return only JSON. Do not break JSON to make a joke. Diagnose, then prescribe, in analysis, gaps, and followUpQueries. No waffle; no fake warmth.`,
    payload: `Query:
${input.query}
${context}
Candidate archive excerpts:
${sources || "(none)"}

Return only JSON with this shape:
{
  "findings": [
    {
      "pageId": "string — must be one of the ids above",
      "title": "string",
      "sourceUrl": "string — use the url from the source if given",
      "excerpt": "short quoted or paraphrased evidence",
      "stance": "supports" | "complicates" | "extends" | "related",
      "analysis": "why this source matters for the query/document, specifically",
      "sourceType": "empirical" | "conceptual" | "review" | "methods" | "practice" | "unknown",
      "population": "who was studied, or omit if not in the note",
      "method": "design or evidence type, or omit if not in the note",
      "keyFinding": "one-sentence finding from this note",
      "claimRelationship": "direct" | "indirect" | "interpretive",
      "confidence": "high" | "medium" | "low",
      "limitation": "sample, design, or measurement limit if stated"
    }
  ],
  "gaps": ["threads not yet covered"],
  "followUpQueries": ["1-3 targeted archive queries that would cover those gaps"]
}

Only cite sources listed above. Prefer supports / complicates / extends over related. Fill sourceType, method, population, keyFinding, claimRelationship, confidence, and limitation from the note when the text supports them. If a field is not in the note, omit it or use "unknown" — never invent method, population, or a finding. If nothing is genuinely useful, return empty findings and explain the gaps.`,
  });
}

export function parseSynthesisJson(raw: string): SynthesisOutput {
  const empty: SynthesisOutput = { findings: [], gaps: [], followUpQueries: [] };
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return empty;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      findings?: unknown;
      gaps?: unknown;
      followUpQueries?: unknown;
    };
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.flatMap(item => {
          const result = ResearchFindingSchema.safeParse(item);
          return result.success ? [result.data] : [];
        })
      : [];
    const gaps = Array.isArray(parsed.gaps) ? parsed.gaps.filter((item): item is string => typeof item === "string") : [];
    const followUpQueries = Array.isArray(parsed.followUpQueries)
      ? parsed.followUpQueries.filter((item): item is string => typeof item === "string")
      : [];
    return { findings, gaps, followUpQueries };
  } catch {
    return empty;
  }
}

export async function synthesizeWithAnthropic(input: {
  query: string;
  documentContext?: string;
  sources: SynthesisSource[];
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<SynthesisOutput> {
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
      max_tokens: 4000,
      messages: [{ role: "user", content: buildSynthesisPrompt(input) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = payload.content?.find(block => block.type === "text")?.text ?? "";
  return parseSynthesisJson(text);
}
