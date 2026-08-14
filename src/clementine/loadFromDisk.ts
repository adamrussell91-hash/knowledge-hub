import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadPromptFile(name: string, cwd = process.cwd()): string {
  try {
    const text = readFileSync(join(cwd, "prompts", name), "utf8");
    if (!text.trim()) throw new Error(`Prompt file missing: ${name}`);
    return text;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Prompt file missing:")) throw error;
    throw new Error(`Prompt file missing: ${name}`);
  }
}
