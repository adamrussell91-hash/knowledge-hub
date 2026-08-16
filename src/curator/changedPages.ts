import { RUN_CAP } from "./schema";

export type PageChange = {
  id: string;
  status: "A" | "M" | "D";
};

export function parseNameStatus(output: string): PageChange[] {
  const changes: PageChange[] = [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^([AMD])\t+pages\/(.+)\.json$/);
    if (!match) continue;
    const status = match[1] as PageChange["status"];
    const id = match[2];
    if (id) changes.push({ id, status });
  }
  return changes;
}

export function capChanged(changes: PageChange[], cap = RUN_CAP) {
  const work = changes.filter(change => change.status !== "D");
  return {
    process: work.slice(0, cap),
    deferred: work.slice(cap),
    deleted: changes.filter(change => change.status === "D"),
  };
}
