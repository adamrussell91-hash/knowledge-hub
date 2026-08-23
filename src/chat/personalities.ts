export type ChatPersonalityId = "clementine" | "ann";

export type ChatPersonality = {
  id: ChatPersonalityId;
  name: string;
  shortName: string;
  colour: string;
  avatarSrc: string;
  voiceFile: string;
  nameTriggers: string[];
};

export const CHAT_PERSONALITIES: ChatPersonality[] = [
  {
    id: "clementine",
    name: "Professor Clementine Haig",
    shortName: "Clementine",
    colour: "#3B57A8",
    avatarSrc: "/assets/agents/clementine.png",
    voiceFile: "clementine-voice.md",
    nameTriggers: ["professor clementine haig", "clementine haig", "clementine", "haig"],
  },
  {
    id: "ann",
    name: "Ann O’Tation",
    shortName: "Ann",
    colour: "#5B141A",
    avatarSrc: "/assets/agents/ann.png",
    voiceFile: "annotation-voice.md",
    nameTriggers: ["ann o'tation", "ann otation", "ann"],
  },
];

export const DEFAULT_CHAT_PERSONALITY: ChatPersonalityId = "clementine";

export function personalityById(id: string): ChatPersonality | undefined {
  return CHAT_PERSONALITIES.find(item => item.id === id);
}

export function isChatPersonalityId(value: string): value is ChatPersonalityId {
  return CHAT_PERSONALITIES.some(item => item.id === value);
}

export type OverlayNote = { pageId: string; title: string };

/** Keep the last `max` distinct notes, newest last. */
export function pinOverlayNote(existing: OverlayNote[], next: OverlayNote, max = 2): OverlayNote[] {
  const without = existing.filter(note => note.pageId !== next.pageId);
  return [...without, next].slice(-max);
}
