import { loadPromptFile } from "../clementine/loadFromDisk";

/** Node / Netlify only — do not import from browser code. */
export function bookNoteProtocol(cwd = process.cwd()): string {
  return loadPromptFile("clementine-book-note.md", cwd);
}
