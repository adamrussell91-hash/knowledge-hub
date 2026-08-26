import { escapeHtml } from "../lib/dom";
import { CHAT_PERSONALITIES } from "./personalities";

export type PortraitIdeaId = "now" | "header" | "thread" | "composer" | "together";

export type PortraitIdea = {
  id: PortraitIdeaId;
  label: string;
  explain: string;
};

export const PORTRAIT_IDEAS: PortraitIdea[] = [
  {
    id: "now",
    label: "Now",
    explain: "The Chat tab as it ships: her name in type, no face. Overlay already has portraits; this workplace does not.",
  },
  {
    id: "header",
    label: "Header",
    explain: "Park her portrait beside the page title. She is in the room before anyone speaks, without repeating on every turn.",
  },
  {
    id: "thread",
    label: "Thread",
    explain: "Give each of her turns the same circular portrait as the overlay. That is the existing chat language.",
  },
  {
    id: "composer",
    label: "Composer",
    explain: "A presence strip in the form. Visible on an empty sitting, while you are writing, not only after she replies.",
  },
  {
    id: "together",
    label: "Together",
    explain: "Header plus thread. Overlay language at workplace scale: she greets you in the title and speaks with a face.",
  },
];

export function isPortraitIdeaId(value: string): value is PortraitIdeaId {
  return PORTRAIT_IDEAS.some(idea => idea.id === value);
}

export type ChatVisualiserHost = {
  app: HTMLElement;
  shell: (main: string) => void;
  render: () => void;
  pageHeader: (eyebrow: string, title: string, actionsInner?: string) => string;
  onBackToChat: () => void;
  onIdeaChange?: (idea: PortraitIdeaId) => void;
};

const CLEMENTINE = CHAT_PERSONALITIES[0]!;
const SAMPLE_USER = "What does the archive actually support on retrieval practice?";
const SAMPLE_REPLY =
  "The notes jointly support spaced retrieval as a catalyst, not a teaching style. It changes what students can do later, not how a lesson looks.";

let idea: PortraitIdeaId = "header";

export function enterChatVisualiser(next?: PortraitIdeaId) {
  if (next && isPortraitIdeaId(next)) idea = next;
}

export function currentVisualiserIdea(): PortraitIdeaId {
  return idea;
}

function portrait(className: string, size: number) {
  return `<img class="${className}" src="${CLEMENTINE.avatarSrc}" alt="${escapeHtml(CLEMENTINE.name)}" width="${size}" height="${size}" />`;
}

function mockHeader(showPortrait: boolean) {
  const copy = `<div class="page-header__copy">
      <p class="eyebrow page-header__eyebrow">Professor Clementine Haig</p>
      <h1 class="page-header__title">Chat</h1>
    </div>
    <div class="page-header__actions"><button class="btn btn--ghost" type="button" tabindex="-1">New chat</button></div>`;
  if (!showPortrait) {
    return `<header class="topbar page-header">${copy}</header>`;
  }
  return `<header class="topbar page-header chat-presence-header">
    ${portrait("chat-presence__portrait", 56)}
    ${copy}
  </header>`;
}

function mockHats() {
  return `<p class="chat__picker-label">How should she work</p>
    <div class="graph-modes" role="group" aria-label="Chat hats">
      <button type="button" class="is-active" tabindex="-1"><span>Thematic synthesis</span></button>
      <button type="button" tabindex="-1"><span>Evidence check</span></button>
      <button type="button" tabindex="-1"><span>Writing</span></button>
    </div>
    <p class="alchemist__mode">Standard · Iterative</p>`;
}

function mockComposer(showPresence: boolean) {
  return `<form class="coach__form glass-panel">
    ${
      showPresence
        ? `<div class="chat-presence-strip">
            ${portrait("chat-message__avatar", 36)}
            <div>
              <p class="chat-overlay__who">Talking to Clementine</p>
              <p class="alchemist__mode">Thematic synthesis · Standard · Iterative</p>
            </div>
          </div>`
        : ""
    }
    ${mockHats()}
    <label>Message</label>
    <textarea rows="2" readonly tabindex="-1">Ask about the archive…</textarea>
    <div class="alchemist__actions"><button type="button" tabindex="-1">Send</button></div>
  </form>`;
}

function mockTurn(role: "user" | "assistant", body: string, showPortrait: boolean) {
  const who = role === "user" ? "You" : "Clementine";
  const face = role === "assistant" && showPortrait ? portrait("chat-message__avatar", 36) : "";
  return `<article class="coach-msg coach-msg--${role} glass-panel${face ? " coach-msg--with-portrait" : ""}">
    ${face}
    <div class="coach-msg__copy">
      <p class="coach-msg__who">${who}</p>
      <div class="coach-msg__body${role === "user" ? " coach-msg__body--plain" : ""}">${escapeHtml(body)}</div>
    </div>
  </article>`;
}

export function mockChatWorkplace(selected: PortraitIdeaId): string {
  const headerPortrait = selected === "header" || selected === "together";
  const threadPortrait = selected === "thread" || selected === "together";
  const composerPortrait = selected === "composer";
  return `<section class="coach chat chat-visualiser__stage" data-portrait-idea="${selected}" aria-hidden="true">
    ${mockHeader(headerPortrait)}
    ${mockComposer(composerPortrait)}
    <div class="coach__thread">
      ${mockTurn("user", SAMPLE_USER, false)}
      ${mockTurn("assistant", SAMPLE_REPLY, threadPortrait)}
    </div>
  </section>`;
}

export function renderChatVisualiser(host: ChatVisualiserHost) {
  const current = PORTRAIT_IDEAS.find(item => item.id === idea)!;
  host.shell(`
    ${host.pageHeader(
      "Chat visualiser",
      "Where should she sit?",
      `<button class="btn btn--ghost" data-back-to-chat type="button">← Chat</button>`,
    )}
    <section class="chat-visualiser">
      <aside class="chat-visualiser__ideas" aria-label="Portrait placements">
        <p class="chat__picker-label">Ideas</p>
        <div class="graph-modes" role="tablist" aria-label="Portrait ideas">
          ${PORTRAIT_IDEAS.map(
            item =>
              `<button type="button" role="tab" aria-selected="${item.id === idea}" data-portrait-idea="${item.id}" class="${item.id === idea ? "is-active" : ""}">${escapeHtml(item.label)}</button>`,
          ).join("")}
        </div>
        <p class="chat-visualiser__explain">${escapeHtml(current.explain)}</p>
      </aside>
      <div class="chat-visualiser__frame glass-panel">
        ${mockChatWorkplace(idea)}
      </div>
    </section>
  `);

  host.app.querySelector<HTMLButtonElement>("[data-back-to-chat]")?.addEventListener("click", () => {
    host.onBackToChat();
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-portrait-idea]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.portraitIdea;
      if (!next || !isPortraitIdeaId(next) || next === idea) return;
      idea = next;
      host.onIdeaChange?.(idea);
      host.render();
    };
  });
}
