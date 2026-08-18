export type CompareFile = {
  filename: string;
  status: string;
};

export type RecentCommit = {
  sha: string;
  parents: string[];
};

const STATUS: Record<string, "A" | "M" | "D"> = {
  added: "A",
  modified: "M",
  changed: "M",
  removed: "D",
  renamed: "A",
};

export function nameStatusFromCompareFiles(files: CompareFile[]): string {
  return files
    .map(file => {
      const flag = STATUS[file.status];
      if (!flag || !file.filename.startsWith("pages/") || !file.filename.endsWith(".json")) return "";
      return `${flag}\t${file.filename}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function seedShaFromRecentCommits(commits: RecentCommit[]): string | undefined {
  const oldest = commits.at(-1);
  return oldest?.parents[0];
}

export function resolveStartSha(
  lastProcessedSha: string | undefined,
  head: string,
  recent: RecentCommit[],
): { sha: string; skip: boolean } {
  if (lastProcessedSha) return { sha: lastProcessedSha, skip: false };
  const seed = seedShaFromRecentCommits(recent);
  if (!seed) return { sha: head, skip: true };
  return { sha: seed, skip: false };
}
