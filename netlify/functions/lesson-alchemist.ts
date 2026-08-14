import { assembleClementinePrompt } from "../../src/clementine/assemble";
import { loadPromptFile } from "../../src/clementine/loadFromDisk";
import type { Handler } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IndexEntry } from "../../scripts/build-index";
import { createDataRepo } from "./_lib/dataRepo";
import { topKBySimilarity } from "./_lib/similarity";
import { embedQuery as embedOpenAI } from "../../src/lib/embed";
import { lexicalRetrieve } from "../../src/lib/lexicalRetrieve";

interface Retrieved {
  pageId: string;
  title: string;
  excerpt: string;
}

export type AlchemistConnection = {
  icon: string;
  summary: string;
  sourcePageId: string;
  sourcePageTitle: string;
  sourceExcerpt: string;
  whyNonObvious: string;
};

export function buildAlchemistPrompt(input: { lessonText: string; retrieved: Retrieved[] }) {
  const sources = input.retrieved
    .map((item, index) => `[${index + 1}] "${item.title}" (id: ${item.pageId})\n${item.excerpt}`)
    .join("\n\n");
  return assembleClementinePrompt({
    voice: loadPromptFile("clementine-voice.md"),
    job: loadPromptFile("clementine-university.md"),
    surface: `This turn is the Alchemist rail: the school–university bridge. Paste-lesson in, archive out. Write summary and whyNonObvious in your own voice — not as a generic tool. Return only a JSON array. Do not break JSON to make a joke. Do not run draft-review protocols on this turn.`,
    payload: `Lesson:
${input.lessonText}

Candidate archive excerpts:
${sources}

For each genuinely non-obvious connection, return only a JSON array of objects with icon (one of the Icons of Depth and Complexity), summary, sourcePageId, sourcePageTitle, sourceExcerpt, and whyNonObvious. Only cite sources above.`,
  });
}

export function parseConnectionsJson(raw: string): AlchemistConnection[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AlchemistConnection =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as AlchemistConnection).sourcePageId === "string" &&
        typeof (item as AlchemistConnection).summary === "string",
    );
  } catch {
    return [];
  }
}

async function embedQuery(text: string) {
  const key = process.env.EMBEDDINGS_API_KEY;
  if (!key) return null;
  return embedOpenAI(text, key);
}

async function retrieveCandidates(lessonText: string): Promise<Retrieved[]> {
  const indexPath = path.join(process.cwd(), "migrated", "index.json");
  try {
    const index = JSON.parse(await readFile(indexPath, "utf8")) as IndexEntry[];
    const vector = await embedQuery(lessonText);
    if (vector && index.length && index[0]?.vector?.length) {
      return topKBySimilarity(index, vector, 8).map(item => ({
        pageId: item.pageId,
        title: item.title,
        excerpt: item.excerpt,
      }));
    }
  } catch {
    // Fall through to lexical retrieval from the data repo / fixtures.
  }

  const manifest = await createDataRepo().listManifest();
  return lexicalRetrieve(
    manifest.map(entry => ({
      id: entry.id,
      title: entry.title,
      excerpt: entry.excerpt,
      tags: entry.tags,
      area: entry.area,
    })),
    lessonText,
    8,
  ).map(hit => ({ pageId: hit.id, title: hit.title, excerpt: hit.excerpt }));
}

function retrievalOnlyConnections(retrieved: Retrieved[]): AlchemistConnection[] {
  return retrieved.map(item => ({
    icon: "Multiple Perspectives",
    summary: `Related archive note: ${item.title}`,
    sourcePageId: item.pageId,
    sourcePageTitle: item.title,
    sourceExcerpt: item.excerpt,
    whyNonObvious:
      "Lexical retrieval only — Anthropic synthesis unavailable. Review the source and decide whether the link is non-obvious.",
  }));
}

export const handler: Handler = async event => {
  const cors = {
    "Access-Control-Allow-Origin": process.env.TEACHING_HUB_ORIGIN ?? "*",
    Vary: "Origin",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Headers": "Content-Type, x-alchemist-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (
    !process.env.ALCHEMIST_SHARED_SECRET ||
    event.headers["x-alchemist-secret"] !== process.env.ALCHEMIST_SHARED_SECRET
  ) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let lessonText = "";
  try {
    lessonText = JSON.parse(event.body ?? "{}").lessonText;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  if (typeof lessonText !== "string" || !lessonText.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "lessonText is required" }) };
  }

  try {
    const retrieved = await retrieveCandidates(lessonText);
    if (!retrieved.length) {
      return {
        statusCode: 200,
        headers: { ...cors, "Content-Type": "application/json" },
        body: JSON.stringify({ connections: [], mode: "empty" }),
      };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        statusCode: 200,
        headers: { ...cors, "Content-Type": "application/json" },
        body: JSON.stringify({ connections: retrievalOnlyConnections(retrieved), mode: "retrieval" }),
      };
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: buildAlchemistPrompt({ lessonText, retrieved }) }],
    });
    const content = message.content.find(block => block.type === "text");
    const connections = parseConnectionsJson(content?.type === "text" ? content.text : "[]");

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ connections, mode: "synthesis", retrieved }),
    };
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Alchemist run failed", detail: String(error) }),
    };
  }
};
