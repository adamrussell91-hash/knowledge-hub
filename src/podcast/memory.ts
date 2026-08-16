export function pickMemories(input: {
  seriesId?: string;
  scopeTags?: string[];
  episodes: { seriesId?: string; scope?: { tags?: string[] }; memory: string; created_at: string }[];
}) {
  const withMemory = input.episodes.filter(e => e.memory.trim());
  if (input.seriesId) {
    return withMemory
      .filter(e => e.seriesId === input.seriesId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(e => e.memory);
  }
  const tagged = withMemory.filter(e => {
    if (!input.scopeTags?.length) return true;
    return input.scopeTags.some(tag => e.scope?.tags?.includes(tag));
  });
  return tagged.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3).map(e => e.memory);
}
