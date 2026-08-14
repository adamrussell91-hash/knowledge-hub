import { defineConfig } from "vite";
import { localDataPlugin } from "./vite.localData";

export default defineConfig({
  plugins: [localDataPlugin()],
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
