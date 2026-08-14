import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import { localDataPlugin } from "./vite.localData";

function markdownAsString(): Plugin {
  return {
    name: "markdown-as-string",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0] ?? id;
      if (!file.endsWith(".md")) return;
      return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
    },
  };
}

export default defineConfig({
  plugins: [markdownAsString(), localDataPlugin()],
  server: {
    watch: { ignored: ["**/migrated/**"] },
  },
  test: {
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts", "tests/integration/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/migrated/**"],
  },
});
