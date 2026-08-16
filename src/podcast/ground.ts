import type { PodcastTurn } from "./schema";

const CITED_KINDS = new Set(["content", "model-answer", "interrupt"]);

export function groundTurns(
  turns: PodcastTurn[],
  sources: { pageId: string; title: string }[],
) {
  const allowed = new Set(sources.map((s) => s.pageId));
  const titles = new Set(sources.map((s) => s.title.toLowerCase()));
  const kept: PodcastTurn[] = [];
  const dropped: string[] = [];

  for (const turn of turns) {
    const ids = turn.citations.map((c) => c.pageId);

    if (CITED_KINDS.has(turn.kind) && (!ids.length || ids.some((id) => !allowed.has(id)))) {
      dropped.push(turn.id);
      continue;
    }

    if (ids.some((id) => !allowed.has(id))) {
      dropped.push(turn.id);
      continue;
    }

    const quoted = [...turn.text.matchAll(/(?<![A-Za-z])'([^']+)'|"([^"]+)"/g)].map((m) =>
      (m[1] ?? m[2] ?? "").toLowerCase(),
    );
    if (quoted.some((title) => title && !titles.has(title))) {
      dropped.push(turn.id);
      continue;
    }

    kept.push(turn);
  }

  return { kept, dropped };
}
