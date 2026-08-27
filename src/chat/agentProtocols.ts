import { CHAT_HATS, hatById, type ChatHatId } from "./hats";
import type { ChatPersonalityId } from "./personalities";

export type AgentProtocolPill = {
  id: string;
  label: string;
  steer: string;
  explain: string;
  hat: ChatHatId;
};

export type AgentProtocolPack = {
  firstName: string;
  eyebrow: string;
  pills: AgentProtocolPill[];
};

const CLEMENTINE_LABELS: Partial<Record<ChatHatId, string>> = {
  scoping: "Scope the archive",
  internalExternal: "Archive then outside",
};

function clementinePills(): AgentProtocolPill[] {
  return CHAT_HATS.map(hat => ({
    id: hat.id,
    label: CLEMENTINE_LABELS[hat.id] ?? hat.label,
    steer: hat.plan,
    explain: hat.explain,
    hat: hat.id,
  }));
}

export const AGENT_PROTOCOLS: Record<ChatPersonalityId, AgentProtocolPack> = {
  clementine: {
    firstName: "Clementine",
    eyebrow: "Clementine can",
    pills: clementinePills(),
  },
  ann: {
    firstName: "Ann",
    eyebrow: "Ann can",
    pills: [
      {
        id: "close-read",
        label: "Close-read",
        hat: "synthesis",
        steer: "Close reading protocol — read the notes in play as texts, not topics.",
        explain: "Read a pinned or retrieved note the way Ann reads a manuscript.",
      },
      {
        id: "find-turn",
        label: "Where's the turn?",
        hat: "synthesis",
        steer: "Narrative turn — every lesson is a narrative. Name where the turn is or should be.",
        explain: "Find the hinge moment in the lesson or note sequence.",
      },
      {
        id: "pacing",
        label: "Read the pacing",
        hat: "synthesis",
        steer: "Pacing read — the rhythm and white space tell more than the stated content.",
        explain: "Comment on pacing, not just what was taught.",
      },
      {
        id: "annotate",
        label: "Annotate this",
        hat: "synthesis",
        steer: "Annotation protocol — one sharp editorial note grounded in the text.",
        explain: "Offer a precise annotation, not a checklist.",
      },
      {
        id: "subtext",
        label: "Subtext read",
        hat: "synthesis",
        steer: "Subtext read — what the notes imply but do not say aloud.",
        explain: "Surface the subtext beneath the surface moves.",
      },
    ],
  },
};

export function protocolsForPersonality(personalityId: ChatPersonalityId | null | undefined): AgentProtocolPack | null {
  if (!personalityId) return null;
  return AGENT_PROTOCOLS[personalityId] ?? null;
}

export function findProtocol(personalityId: ChatPersonalityId | null | undefined, protocolId: string | null | undefined) {
  if (!personalityId || !protocolId) return null;
  return protocolsForPersonality(personalityId)?.pills.find(pill => pill.id === protocolId) ?? null;
}

export function protocolHat(
  personalityId: ChatPersonalityId,
  protocolId: string | null | undefined,
  fallback: ChatHatId = "synthesis",
): ChatHatId {
  const pill = findProtocol(personalityId, protocolId);
  return pill?.hat ?? fallback;
}

export function protocolSteerBlock(personalityId: ChatPersonalityId, protocolId: string): string {
  const pill = findProtocol(personalityId, protocolId);
  if (!pill) return "";
  const hat = hatById(pill.hat);
  return [
    `Adam chose the "${pill.label}" protocol for this turn (${pill.steer}).`,
    `Run that protocol in character from your first word under the ${hat.label} hat.`,
    "Do not narrate routing, name this as a system feature, or dump a description of what the protocol is.",
    "If he also wrote a message, treat it as the start of that protocol.",
  ].join(" ");
}

export function normalizeProtocolId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !/^[a-z0-9-]+$/.test(trimmed)) return undefined;
  return trimmed;
}
