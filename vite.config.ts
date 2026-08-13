import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts", "tests/integration/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
