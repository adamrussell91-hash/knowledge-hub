const LEADING = [
  /^(hey|please|can you|could you|tell me)\s+/i,
  /^(what|where|which|who|when|how)\s+/i,
  /^(do i|did i|have i|is there|are there|have you|got)\s+/i,
  /^(have|got|any|anything|something|notes?|material|stuff)\s+/i,
  /^(on|about|regarding|re|for|in)\s+/i,
];

const TRAILING = /\s+(in the archive|in my (?:notes|archive)|please|thanks)\s*$/i;

/** Strip "what do I have on …" so retrieval searches the topic, not the question. */
export function topicQuery(raw: string): string {
  let next = raw.trim();
  if (!next) return "";
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of LEADING) {
      const stripped = next.replace(pattern, "");
      if (stripped !== next) {
        next = stripped;
        changed = true;
      }
    }
  }
  next = next.replace(TRAILING, "").replace(/[?!.,;:]+$/g, "").replace(/\s+/g, " ").trim();
  return next || raw.trim();
}
