import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSchema } from "../src/domain/page";
import type { PageManifestEntry } from "../src/domain/page";
import { proposeTidy, type TidyUsage } from "../src/tidy/propose";
import type { TidyIO, TidyState } from "../src/tidy/run";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function createLocalTidyIO(input: {
  dataDir: string;
  apiKey: string;
  prompt: string;
  now?: () => string;
  onUsage?: (usage: TidyUsage) => void;
}): Omit<TidyIO, "id" | "scan" | "count"> {
  const tidyDir = path.join(input.dataDir, "_tidy");
  const statePath = path.join(tidyDir, "state.json");
  return {
    listPageIds: async () => (await readdir(path.join(input.dataDir, "pages")))
      .filter(file => file.endsWith(".json"))
      .map(file => file.slice(0, -5)),
    readPage: async id => {
      try {
        return PageSchema.parse(JSON.parse(await readFile(path.join(input.dataDir, "pages", `${id}.json`), "utf8")));
      } catch {
        return null;
      }
    },
    writePage: async page => writeFile(path.join(input.dataDir, "pages", `${page.id}.json`), `${JSON.stringify(page, null, 2)}\n`),
    readManifest: () => readJson<PageManifestEntry[]>(path.join(input.dataDir, "manifest.json"), []),
    writeManifest: async entries => writeFile(path.join(input.dataDir, "manifest.json"), `${JSON.stringify(entries, null, 2)}\n`),
    readState: () => readJson<TidyState>(statePath, { tidied: {} }),
    writeState: async state => {
      await mkdir(tidyDir, { recursive: true });
      await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
    },
    propose: page => proposeTidy({ page, prompt: input.prompt, apiKey: input.apiKey, onUsage: input.onUsage }),
    now: input.now ?? (() => new Date().toISOString()),
  };
}
