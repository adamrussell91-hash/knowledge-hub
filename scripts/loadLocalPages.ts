import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "../src/domain/page";

const READ_BATCH = 32;

export async function loadDotEnv() {
  try {
    const raw = await readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional
  }
}

export async function mapInBatches<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    out.push(...(await fn(items.slice(offset, offset + size))));
  }
  return out;
}

export async function loadLocalStagedPages(
  onProgress?: (done: number, total: number) => void,
): Promise<Page[] | null> {
  const stage = path.join(process.cwd(), "migrated", "data-repo", "pages");
  try {
    const files = (await readdir(stage)).filter(name => name.endsWith(".json"));
    if (!files.length) return null;
    const pages = await mapInBatches(files, READ_BATCH, async chunk =>
      Promise.all(
        chunk.map(async name => JSON.parse(await readFile(path.join(stage, name), "utf8")) as Page),
      ),
    );
    onProgress?.(pages.length, files.length);
    return pages;
  } catch {
    return null;
  }
}
