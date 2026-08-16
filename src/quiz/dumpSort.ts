import { quizItemId } from "./harvest";
import { newFsrsCard, type DumpSnapshot, type QuizEdge, type QuizItem } from "./schema";

export type DumpNodeType = "black" | "blue" | "center";

export type DumpNode = {
  id: string;
  x: number;
  y: number;
  text: string;
  type: DumpNodeType;
};

export type DumpEdge = {
  from: string;
  to: string;
  label?: string;
};

export function dumpPageId(topic: string) {
  const id = quizItemId("dump", "heading", topic.trim().toLowerCase()).replace(/^item_/, "");
  return `page_hub_dump_${id}`;
}

export function dumpSessionToQuiz(input: {
  topic: string;
  nodes: DumpNode[];
  edges: DumpEdge[];
  area: "university" | "notes";
  tags: string[];
  now?: Date;
}): { items: QuizItem[]; edges: QuizEdge[]; snapshot: DumpSnapshot } {
  const now = input.now ?? new Date();
  const topic = input.topic.trim();
  const pageId = dumpPageId(topic);
  const nodeItems = new Map<string, QuizItem>();
  for (const node of input.nodes) {
    const text = node.text.replace(/\s+/g, " ").trim();
    if (node.type === "center" || !text) continue;
    if (node.type === "blue" && text.toLowerCase() === "gap") continue;
    if (node.type === "black" && text.toLowerCase() === "idea") continue;
    const kind = node.type === "blue" ? "gap" : "known";
    const cue = node.type === "blue" ? `What is missing: ${text}?` : `What did you retrieve: ${text}?`;
    const item: QuizItem = {
      id: quizItemId(pageId, kind, cue),
      page_id: pageId,
      area: input.area,
      tags: input.tags,
      kind,
      cue,
      answer: node.type === "blue" ? `Gap from Dump and Sort on ${topic}.` : text,
      harvested_at: now.toISOString(),
      source_updated_at: now.toISOString(),
      fsrs: newFsrsCard(now),
      status: "untested",
      x: node.x,
      y: node.y,
    };
    nodeItems.set(node.id, item);
  }
  const items = [...nodeItems.values()];
  const edges = input.edges
    .map(edge => {
      const from = nodeItems.get(edge.from);
      const to = nodeItems.get(edge.to);
      if (!from || !to) return null;
      return { from: from.id, to: to.id, page_id: pageId };
    })
    .filter((edge): edge is QuizEdge => Boolean(edge));
  return {
    items,
    edges,
    snapshot: {
      topic,
      page_id: pageId,
      nodes: input.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, text: node.text, type: node.type })),
      edges: input.edges.map(edge => ({ from: edge.from, to: edge.to })),
      saved_at: now.toISOString(),
    },
  };
}

export function gapsToQuizItems(input: {
  topic: string;
  nodes: DumpNode[];
  area: "university" | "notes";
  tags: string[];
  now?: Date;
}): QuizItem[] {
  return dumpSessionToQuiz({ ...input, edges: [] }).items.filter(item => item.kind === "gap");
}

export function sortThenDumpPeek(
  topic: string,
  dumps: DumpSnapshot[],
  headings: { cue: string; kind: string }[],
): DumpNode[] {
  const dump = dumps.find(item => item.page_id === dumpPageId(topic));
  if (dump) return dump.nodes;
  return headings
    .filter(item => item.kind === "heading")
    .slice(0, 12)
    .map((item, index) => ({
      id: `peek${index}`,
      x: 18 + (index % 4) * 20,
      y: 22 + Math.floor(index / 4) * 22,
      text: item.cue.replace(/^What does this note claim about:\s*/i, "").replace(/\?$/, ""),
      type: "black" as const,
    }));
}

export type GapScore = {
  id: string;
  text: string;
  rank: number;
  known: number;
  gaps: number;
  guidance: string;
};

export function scoreBlueGaps(nodes: DumpNode[], edges: DumpEdge[]): GapScore[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const blues = nodes.filter(node => node.type === "blue" && node.text.trim() && node.text.trim().toLowerCase() !== "gap");
  const scored = blues.map(node => {
    const neighbours = edges
      .filter(edge => edge.from === node.id || edge.to === node.id)
      .map(edge => byId.get(edge.from === node.id ? edge.to : edge.from))
      .filter((item): item is DumpNode => Boolean(item));
    const known = neighbours.filter(item => item.type === "black" || item.type === "center").length;
    const gaps = neighbours.filter(item => item.type === "blue").length;
    let rank = 4;
    let guidance = "No connections drawn to this node. Study it last and ask how it fits the topic.";
    if (gaps > 0 && known === 0) {
      rank = 1;
      guidance = "This sits in a cluster of gaps. Study those gaps together and link them back to something you already know.";
    } else if (gaps > 0 && known > 0) {
      rank = 2;
      guidance = "This gap bridges known material and other gaps. Understanding it will likely unlock the others.";
    } else if (known > 0) {
      rank = 3;
      guidance = "Connected to what you already retrieved. Study it alongside that known node.";
    }
    return { id: node.id, text: node.text.trim(), rank, known, gaps, guidance };
  });
  return scored.sort((a, b) => a.rank - b.rank || b.known - a.known);
}
