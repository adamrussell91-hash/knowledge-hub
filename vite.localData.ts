import path from "node:path";
import fs from "node:fs";
import type { Plugin } from "vite";

/** Serve migrated/data-repo at /local-data during Vite dev — no Netlify needed. */
export function localDataPlugin(root = path.join(process.cwd(), "migrated", "data-repo")): Plugin {
  return {
    name: "knowledge-hub-local-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
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
