import { ChatWriteDroppedError, getPage, runChat, savePage, USE_LOCAL_DATA } from "../api/client";
import { escapeHtml, showToast } from "../lib/dom";
import { renderMarkdown } from "../lib/markdown";
import { topicKeywords } from "../archive/keywordGraph";
import type { Page } from "../domain/page";
import type { ChatTurnResult } from "./chatTurn";
import {
  CHAT_PERSONALITIES,
  DEFAULT_CHAT_PERSONALITY,
  isChatPersonalityId,
  personalityById,
  pinOverlayNote,
  type ChatPersonalityId,
  type OverlayNote,
} from "./personalities";
import { applyRetagToPage, parseNoteEdit, retagDelta, type RetagProposal } from "./noteEdit";

const STORAGE_KEY = "knowledge-hub-overlay-chat-v1";
const ROOT_ID = "kh-chat-overlay";

type OverlayTurn = {
  role: "user" | "assistant";
  content: string;
  edit?: RetagProposal;
};

export type ChatOverlayHost = {
  visible: boolean;
  onSavedPage?: (page: Page) => Promise<void> | void;
  topicsFor?: (pageId: string) => string[];
};

let personality: ChatPersonalityId = DEFAULT_CHAT_PERSONALITY;
let open = false;
let input = "";
let turns: OverlayTurn[] = [];
let notes: OverlayNote[] = [];
let writeSessionId = "";
let researchSessionId = "";
let busy = false;
let error = "";
let confirmBusy = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let currentHost: ChatOverlayHost | null = null;

function persist() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ personality, open, input, turns, notes, writeSessionId, researchSessionId }),
    );
  } catch {
    /* private mode */
  }
}

function restore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<{
      personality: string;
      open: boolean;
      input: string;
      turns: OverlayTurn[];
      notes: OverlayNote[];
      writeSessionId: string;
      researchSessionId: string;
    }>;
    if (saved.personality && isChatPersonalityId(saved.personality)) personality = saved.personality;
    open = Boolean(saved.open);
    input = saved.input ?? "";
    turns = saved.turns ?? [];
    notes = Array.isArray(saved.notes) ? saved.notes : [];
    writeSessionId = saved.writeSessionId ?? "";
    researchSessionId = saved.researchSessionId ?? "";
  } catch {
    /* keep defaults */
  }
}

function resetSitting() {
  input = "";
  turns = [];
  writeSessionId = "";
  researchSessionId = "";
  error = "";
}

function currentPersonality() {
  return personalityById(personality)!;
}

function lastAssistant(): OverlayTurn | undefined {
  return [...turns].reverse().find(turn => turn.role === "assistant");
}

function applyResult(history: OverlayTurn[], result: ChatTurnResult) {
  if (result.status === "researching") {
    researchSessionId = result.researchSessionId;
    writeSessionId = "";
    return;
  }
  if (result.status === "writing") {
    writeSessionId = result.writeSessionId;
    researchSessionId = "";
    return;
  }
  if (result.status === "compose" || result.status === "external-unavailable") {
    if (result.status === "external-unavailable") error = result.reason;
    researchSessionId = "";
    return;
  }
  researchSessionId = "";
  writeSessionId = "";
  const parsed = parseNoteEdit(result.reply);
  turns = [...history, { role: "assistant", content: parsed.prose, edit: parsed.edit }];
}

async function send() {
  if (busy || !currentHost) return;
  const outgoing = input.trim();
  if (!outgoing && !researchSessionId && !writeSessionId) return;
  const history: OverlayTurn[] = researchSessionId || writeSessionId ? turns : [...turns, { role: "user", content: outgoing }];
  if (!researchSessionId && !writeSessionId) {
    turns = history;
    input = "";
  }
  busy = true;
  error = "";
  persist();
  paint();
  try {
    const result = await runChat({
      hat: "synthesis",
      personality,
      messages: history.map(({ role, content }) => ({ role, content })),
      noteContext: notes[0],
      notesInPlay: notes,
      researchSessionId: researchSessionId || undefined,
      writeSessionId: writeSessionId || undefined,
    });
    applyResult(history, result);
  } catch (caught) {
    if (caught instanceof ChatWriteDroppedError) {
      error = caught.message;
    } else {
      if (!researchSessionId) input = outgoing;
      error = caught instanceof Error ? caught.message : "Chat failed";
    }
  } finally {
    busy = false;
    persist();
    paint();
    if (researchSessionId || writeSessionId) {
      pollTimer = setTimeout(() => void send(), 2000);
    }
  }
}

function deltaHtml(edit: RetagProposal) {
  const current = currentHost?.topicsFor?.(edit.pageId) ?? [];
  const next = edit.tags;
  const delta = retagDelta(current, next);
  const rows = [
    ...delta.removed.map(tag => `<li class="tag-delta__old">${escapeHtml(tag)}</li>`),
    ...delta.added.map(tag => `<li class="tag-delta__new">${escapeHtml(tag)}</li>`),
    ...delta.kept.map(tag => `<li class="tag-delta__keep">${escapeHtml(tag)}</li>`),
  ];
  return `<ul class="tag-delta">${rows.join("")}</ul>`;
}

async function confirmEdit(edit: RetagProposal) {
  if (confirmBusy || !currentHost) return;
  confirmBusy = true;
  paint();
  try {
    const page = await getPage(edit.pageId);
    const saved = await savePage(applyRetagToPage(page, edit.tags));
    turns = turns.map(turn => (turn.edit === edit ? { ...turn, edit: undefined, content: `${turn.content}\n\nRetagged.` } : turn));
    showToast("Tags updated");
    await currentHost.onSavedPage?.(saved);
  } catch (caught) {
    showToast(caught instanceof Error ? caught.message : "Could not retag that note");
  } finally {
    confirmBusy = false;
    persist();
    paint();
  }
}

function discardEdit(edit: RetagProposal) {
  turns = turns.map(turn => (turn.edit === edit ? { ...turn, edit: undefined } : turn));
  persist();
  paint();
}

function pickerHtml() {
  return `<div class="agent-picker" role="listbox" aria-label="Choose who to talk to">
    ${CHAT_PERSONALITIES.map(item => {
      const active = item.id === personality;
      return `<button type="button" class="agent-picker__avatar${active ? " is-active" : ""}" data-personality="${item.id}" role="option" aria-selected="${active}" title="${escapeHtml(item.name)}" style="--agent-colour:${item.colour}">
        <img src="${item.avatarSrc}" alt="${escapeHtml(item.name)}" width="52" height="52" />
      </button>`;
    }).join("")}
  </div>`;
}

function overlayHtml() {
  const who = currentPersonality();
  return `
    <section class="chat-overlay" aria-label="Chat">
      <div class="chat-overlay__top">
        <p class="chat-overlay__who">Talking to ${escapeHtml(who.shortName)}</p>
        <div class="chat-overlay__tools">
          <button class="btn btn--ghost" type="button" data-new-chat ${busy || writeSessionId || researchSessionId ? "disabled" : ""}>New chat</button>
          <button class="hub-icon-btn chat-overlay__close" type="button" data-close-overlay aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      ${pickerHtml()}
      ${
        notes.length
          ? `<div class="using-notes" aria-label="Notes in play">${notes
              .map(
                note =>
                  `<span class="using-notes__chip">${escapeHtml(note.title)} <button type="button" class="using-notes__clear" data-unpin="${escapeHtml(note.pageId)}" aria-label="Remove ${escapeHtml(note.title)}">×</button></span>`,
              )
              .join("")}</div>`
          : ""
      }
      <ul class="chat-messages">
        ${
          turns.length
            ? turns
                .map(turn => {
                  if (turn.role === "user") {
                    return `<li class="chat-message chat-message--user"><div class="chat-message__body">${escapeHtml(turn.content)}</div></li>`;
                  }
                  return `<li class="chat-message chat-message--assistant" data-agent="${personality}">
                    <img class="chat-message__avatar" src="${who.avatarSrc}" alt="${escapeHtml(who.name)}" width="52" height="52" />
                    <div class="chat-message__body">${renderMarkdown(turn.content)}</div>
                    ${
                      turn.edit
                        ? `<section class="confirm-card" role="region" aria-label="Confirm change">
                            <p class="page-header__eyebrow">Proposed write</p>
                            <h2 class="page-header__title" style="font-size: var(--text-lg)">Retag this note</h2>
                            <p class="page-header__supporting">Replace tags on ${escapeHtml(turn.edit.title)}.</p>
                            ${deltaHtml(turn.edit)}
                            <div class="confirm-card__actions">
                              <button class="btn btn--ghost" type="button" data-discard-edit ${confirmBusy ? "disabled" : ""}>Discard</button>
                              <button class="btn btn--primary" type="button" data-confirm-edit ${confirmBusy ? "disabled" : ""}>${confirmBusy ? "Saving…" : "Confirm"}</button>
                            </div>
                          </section>`
                        : ""
                    }
                  </li>`;
                })
                .join("")
            : `<li class="chat-message chat-message--assistant" data-agent="${personality}">
                <img class="chat-message__avatar" src="${who.avatarSrc}" alt="${escapeHtml(who.name)}" width="52" height="52" />
                <div class="chat-message__body">Ask about the archive, or pin a graph note and I’ll work from that.</div>
              </li>`
        }
      </ul>
      ${error ? `<p class="alchemist__error">${escapeHtml(error)}</p>` : ""}
      <form class="chat-form">
        <input id="overlay-chat-input" value="${escapeHtml(input)}" placeholder="Ask ${escapeHtml(who.shortName)}…" ${busy || writeSessionId || researchSessionId ? "disabled" : ""} />
        <button class="btn btn--primary" type="submit" ${busy || writeSessionId || researchSessionId ? "disabled" : ""}>${busy || writeSessionId || researchSessionId ? "…" : "Send"}</button>
      </form>
    </section>
  `;
}

function fabHtml() {
  const who = currentPersonality();
  return `<button class="floating-chat-button" type="button" data-toggle-overlay aria-label="${open ? "Close chat" : `Chat with ${who.name}`}" title="${escapeHtml(who.name)}">
    <img src="${who.avatarSrc}" alt="" width="52" height="52" />
  </button>`;
}

function rootEl() {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.append(root);
  }
  return root;
}

function bind(root: HTMLElement) {
  root.querySelector<HTMLButtonElement>("[data-toggle-overlay]")?.addEventListener("click", () => {
    open = !open;
    persist();
    paint();
  });
  root.querySelector<HTMLButtonElement>("[data-close-overlay]")?.addEventListener("click", () => {
    open = false;
    persist();
    paint();
  });
  root.querySelector<HTMLButtonElement>("[data-new-chat]")?.addEventListener("click", () => {
    if (busy || writeSessionId || researchSessionId) return;
    resetSitting();
    notes = [];
    persist();
    paint();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-personality]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.personality;
      if (!next || !isChatPersonalityId(next) || next === personality) return;
      personality = next;
      resetSitting();
      persist();
      paint();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-unpin]").forEach(button => {
    button.onclick = () => {
      notes = notes.filter(note => note.pageId !== button.dataset.unpin);
      persist();
      paint();
    };
  });
  const form = root.querySelector<HTMLFormElement>(".chat-form");
  const field = root.querySelector<HTMLInputElement>("#overlay-chat-input");
  if (field) field.oninput = () => { input = field.value; };
  form?.addEventListener("submit", event => {
    event.preventDefault();
    if (field) input = field.value.trim();
    if (USE_LOCAL_DATA) {
      showToast("Chat needs the live API.");
      return;
    }
    void send();
  });
  const pending = lastAssistant()?.edit;
  root.querySelector<HTMLButtonElement>("[data-confirm-edit]")?.addEventListener("click", () => {
    if (pending) void confirmEdit(pending);
  });
  root.querySelector<HTMLButtonElement>("[data-discard-edit]")?.addEventListener("click", () => {
    if (pending) discardEdit(pending);
  });
}

function paint() {
  const root = rootEl();
  if (!currentHost?.visible) {
    root.replaceChildren();
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML = `${open ? overlayHtml() : ""}${fabHtml()}`;
  bind(root);
}

export function ensureChatOverlay(host: ChatOverlayHost) {
  restore();
  currentHost = host;
  if ((researchSessionId || writeSessionId) && !pollTimer && open) {
    pollTimer = setTimeout(() => void send(), 400);
  }
  paint();
}

export function hideChatOverlay() {
  currentHost = null;
  const root = document.getElementById(ROOT_ID);
  if (root) {
    root.replaceChildren();
    root.hidden = true;
  }
}

export function pinChatOverlayNote(note: OverlayNote) {
  restore();
  notes = pinOverlayNote(notes, note);
  persist();
  if (currentHost) paint();
}

export function openChatOverlay(opts?: { note?: OverlayNote }) {
  restore();
  if (opts?.note) notes = pinOverlayNote(notes, opts.note);
  open = true;
  persist();
  if (currentHost) paint();
}

export function overlayPersonalityId() {
  restore();
  return personality;
}
