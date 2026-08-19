import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import type { Plugin } from "vite";
import { PageSchema, type Page, type PageManifestEntry } from "./src/domain/page";
import { handleLocalTidyRoute } from "./src/tidy/localRoute";
import { proposeTidy } from "./src/tidy/propose";
import { tidyOnePage, type TidyState } from "./src/tidy/run";
import { loadDotEnv } from "./scripts/loadLocalPages";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function tidyLocalPage(root: string, id: string, apiKey: string, prompt: string): Promise<Page> {
  const statePath = path.join(root, "_tidy", "state.json");
  await mkdir(path.dirname(statePath), { recursive: true });
  return tidyOnePage(id, {
    listPageIds: async () => [],
    readPage: async pageId => {
      try {
        return PageSchema.parse(JSON.parse(await readFile(path.join(root, "pages", `${pageId}.json`), "utf8")));
      } catch {
        return null;
      }
    },
    writePage: async page => {
      await writeFile(path.join(root, "pages", `${page.id}.json`), JSON.stringify(page));
    },
    readManifest: () => readJson<PageManifestEntry[]>(path.join(root, "manifest.json"), []),
    writeManifest: entries => writeFile(path.join(root, "manifest.json"), JSON.stringify(entries)),
    readState: () => readJson<TidyState>(statePath, { tidied: {} }),
    writeState: state => writeFile(statePath, JSON.stringify(state)),
    propose: page => proposeTidy({ page, prompt, apiKey }),
    now: () => new Date().toISOString(),
  });
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Serve migrated/data-repo at /local-data during Vite dev — no Netlify needed. */
export function localDataPlugin(root = path.join(process.cwd(), "migrated", "data-repo")): Plugin {
  return {
    name: "knowledge-hub-local-data",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.url?.split("?")[0] === "/local-data/tidy") {
          const body = await readBody(req);
          await loadDotEnv();
          const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
          const prompt = fs.readFileSync(path.join(process.cwd(), "prompts", "tidy.md"), "utf8");
          const result = await handleLocalTidyRoute({
            method: req.method,
            url: req.url,
            body,
            tidyPage: id => {
              if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
              return tidyLocalPage(root, id, apiKey, prompt);
            },
          });
          if (!result) return next();
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(result.json));
          return;
        }
        if (!req.url?.startsWith("/local-data/")) return next();
        const relative = decodeURIComponent(req.url.slice("/local-data/".length).split("?")[0] ?? "");
        const filePath = path.normalize(path.join(root, relative));
        if (!filePath.startsWith(root)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}
