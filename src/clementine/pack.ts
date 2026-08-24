import CLEMENTINE_VOICE from "../../prompts/clementine-voice.md";
import CLEMENTINE_UNIVERSITY from "../../prompts/clementine-university.md";
import CLEMENTINE_SCHOOL from "../../prompts/clementine-school.md";
import CLEMENTINE_PODCAST from "../../prompts/clementine-podcast.md";
import ANN_PODCAST from "../../prompts/ann-podcast.md";
import PODCAST_EDITOR from "../../prompts/podcast-editor.md";
import ANNOTATION_VOICE from "../../prompts/annotation-voice.md";
import TIDY from "../../prompts/tidy.md";
import THEMATIC_SYNTHESIS from "../../prompts/clementine-thematic-synthesis.md";

function requirePrompt(name: string, text: string): string {
  if (!text.trim()) throw new Error(`Prompt file missing: ${name}`);
  return text;
}

export const voice = requirePrompt("clementine-voice.md", CLEMENTINE_VOICE);
export const university = requirePrompt("clementine-university.md", CLEMENTINE_UNIVERSITY);
export const school = requirePrompt("clementine-school.md", CLEMENTINE_SCHOOL);
export const clementinePodcast = requirePrompt("clementine-podcast.md", CLEMENTINE_PODCAST);
export const annPodcast = requirePrompt("ann-podcast.md", ANN_PODCAST);
export const podcastEditor = requirePrompt("podcast-editor.md", PODCAST_EDITOR);
export const annotationVoice = requirePrompt("annotation-voice.md", ANNOTATION_VOICE);
export const tidy = requirePrompt("tidy.md", TIDY);
export const thematicSynthesis = requirePrompt("clementine-thematic-synthesis.md", THEMATIC_SYNTHESIS);
