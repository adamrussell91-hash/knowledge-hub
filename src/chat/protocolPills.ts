import { escapeHtml } from "../lib/dom";
import { protocolsForPersonality, type AgentProtocolPill } from "./agentProtocols";
import type { ChatPersonalityId } from "./personalities";

function pillButton(personalityId: ChatPersonalityId, pill: AgentProtocolPill, index: number, selectedId: string | null) {
  const active = pill.id === selectedId;
  const tipId = `protocol-tip-${personalityId}-${pill.id}`;
  return `<button type="button" class="hub-pills__btn${active ? " is-active" : ""}" data-protocol="${escapeHtml(pill.id)}" aria-pressed="${active}" aria-describedby="${tipId}" style="--pill-i:${index}">
    <span class="agent-protocol-pills__label">${escapeHtml(pill.label)}</span>
    <span class="agent-protocol-pills__tip" id="${tipId}" role="tooltip">${escapeHtml(pill.explain)}</span>
  </button>`;
}

export function protocolPillsHtml(personalityId: ChatPersonalityId, selectedId: string | null): string {
  const pack = protocolsForPersonality(personalityId);
  if (!pack?.pills.length) return "";
  return `<div class="agent-protocol-pills">
    <p class="agent-protocol-pills__eyebrow">${escapeHtml(pack.eyebrow)}</p>
    <div class="hub-pills" role="group" aria-label="${escapeHtml(pack.firstName)} protocols">
      ${pack.pills.map((pill, index) => pillButton(personalityId, pill, index, selectedId)).join("")}
    </div>
  </div>`;
}
