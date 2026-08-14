export type LexicalDoc = {
  id: string;
  title: string;
  excerpt: string;
  tags?: string[];
  area?: string;
};

export type LexicalHit = LexicalDoc & { score: number };

const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s&-]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP.has(token));
}

function termFrequency(tokens: string[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/** Lightweight lexical ranker for archive retrieval without embeddings. */
export function lexicalRetrieve(docs: LexicalDoc[], query: string, k = 8): LexicalHit[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const queryTf = termFrequency(queryTokens);
  const querySet = new Set(queryTokens);

  const scored = docs
    .map(doc => {
      const titleTokens = tokenize(doc.title);
      const tagTokens = tokenize((doc.tags ?? []).join(" "));
      const bodyTokens = tokenize(doc.excerpt);
      const titleTf = termFrequency(titleTokens);
      const tagTf = termFrequency(tagTokens);
      const bodyTf = termFrequency(bodyTokens);

      let score = 0;
      for (const token of querySet) {
        const q = queryTf.get(token) ?? 0;
        score += (titleTf.get(token) ?? 0) * 4 * q;
        score += (tagTf.get(token) ?? 0) * 3 * q;
        score += (bodyTf.get(token) ?? 0) * 1.2 * q;
      }

      // Phrase / title bonus
      const hay = `${doc.title} ${doc.excerpt}`.toLowerCase();
      if (query.trim().length > 3 && hay.includes(query.trim().toLowerCase())) score += 6;

      return { ...doc, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return scored.slice(0, k);
}
