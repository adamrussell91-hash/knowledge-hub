import CLEMENTINE_VOICE from "../../prompts/clementine-voice.md";
import CLEMENTINE_UNIVERSITY from "../../prompts/clementine-university.md";
import CLEMENTINE_SCHOOL from "../../prompts/clementine-school.md";

function requirePrompt(name: string, text: string): string {
  if (!text.trim()) throw new Error(`Prompt file missing: ${name}`);
  return text;
}

export const voice = requirePrompt("clementine-voice.md", CLEMENTINE_VOICE);
export const university = requirePrompt("clementine-university.md", CLEMENTINE_UNIVERSITY);
export const school = requirePrompt("clementine-school.md", CLEMENTINE_SCHOOL);
