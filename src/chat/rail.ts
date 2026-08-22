import { ChatWriteDroppedError, runChat, savePage, tidyPage, USE_LOCAL_DATA } from "../api/client";
import { newHubPageId } from "../domain/page";
import type { Page } from "../domain/page";
import { escapeHtml, showToast } from "../lib/dom";
import type { ResearchFinding } from "../research/schema";
import { CHAT_HATS, DEPTHS, SCOPES, hatById, isChatHatId, resolveChatPlan, type ChatDepth, type ChatHatId, type ChatScope } from "./hats";
import { appendTick, chatTick } from "./ticker";
import { briefIsSavable, briefToPage, type SavableFinding } from "./saveBrief";
import type { ChatTurnResult } from "./chatTurn";

export type ChatRailHost = {
  app: HTMLElement;
  shell: (main: string) => void;
  render: () => void;
  onOpenPage?: (pageId: string) => void;
  onSavedPage?: (page: Page) => Promise<void> | void;
  pageHeader: (eyebrow: string, title: string, actionsInner?: string) => string;
  findingCards: (findings: ResearchFinding[]) => string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  findings?: SavableFinding[];
  archiveFailed?: boolean;
  coverageThin?: boolean;
  canSearchOutside?: boolean;
};

const STORAGE_KEY = "knowledge-hub-chat-v1";

let hat: ChatHatId = "scoping";
let scope: ChatScope | undefined;
let depth: ChatDepth | undefined;
let showDials = false;
let thesis = "";
let draft = "";
let input = "";
let turns: ChatTurn[] = [];
let noteContext: { pageId: string; title: string } | undefined;
let researchSessionId = "";
let writeSessionId = "";
let busy = false;
let error = "";
let ticks: string[] = [];
let saveBusy = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hat, scope, depth, showDials, thesis, draft, input, turns, noteContext, researchSessionId, writeSessionId }),
    );
  } catch {
    /* private mode / SSR */
  }
}

function restore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<{
      hat: string;
      scope: ChatScope;
      depth: ChatDepth;
      showDials: boolean;
      thesis: string;
      draft: string;
      input: string;
      turns: ChatTurn[];
      noteContext: { pageId: string; title: string };
      researchSessionId: string;
      writeSessionId: string;
    }>;
    if (saved.hat && isChatHatId(saved.hat)) hat = saved.hat;
    scope = saved.scope;
    depth = saved.depth;
    showDials = Boolean(saved.showDials);
    thesis = saved.thesis ?? "";
    draft = saved.draft ?? "";
    input = saved.input ?? "";
    turns = saved.turns ?? [];
    noteContext = saved.noteContext;
    researchSessionId = saved.researchSessionId ?? "";
    writeSessionId = saved.writeSessionId ?? "";
  } catch {
    /* keep defaults */
  }
}

function resetSitting() {
  thesis = "";
  draft = "";
  input = "";
  turns = [];
  researchSessionId = "";
  writeSessionId = "";
  error = "";
  ticks = [];
  persist();
}

export function enterChatRail(opts?: { noteContext?: { pageId: string; title: string }; fresh?: boolean }) {
  restore();
  if (opts?.fresh) resetSitting();
  if (opts?.noteContext) noteContext = opts.noteContext;
  persist();
}

export function leaveChatRail() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (!busy && !researchSessionId && !writeSessionId) {
    resetSitting();
    noteContext = undefined;
  }
  persist();
}

function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}

function lastAssistant(): ChatTurn | undefined {
  return [...turns].reverse().find(turn => turn.role === "assistant");
}

function sitting() {
  return resolveChatPlan(hat, { scope, depth });
}

function pushTick(
  phase: "searching" | "round" | "writing" | "failed",
  research?: { findings?: unknown[]; followUpQueries?: string[]; round?: number },
) {
  const plan = sitting();
  ticks = appendTick(
    ticks,
    chatTick({
      phase,
      hatLabel: plan.hat.label,
      scope: plan.scope,
      depth: plan.depth,
      round: research?.round,
      maxRounds: plan.maxRounds,
      noteCount: research?.findings?.length,
      followUps: research?.followUpQueries?.length,
    }),
  );
}

function applyResult(history: ChatTurn[], result: ChatTurnResult) {
  if (result.status === "researching") {
    researchSessionId = result.researchSessionId;
    writeSessionId = "";
    if (result.research) pushTick("round", result.research);
    return;
  }
  if (result.status === "writing") {
    writeSessionId = result.writeSessionId;
    researchSessionId = "";
    if (result.research) pushTick("round", result.research);
    pushTick("writing", result.research);
    return;
  }
  if (result.status === "compose") {
    return;
  }
  if (result.status === "external-unavailable") {
    error = result.reason;
    researchSessionId = "";
    return;
  }
  researchSessionId = "";
  writeSessionId = "";
  turns = [
    ...history,
    {
      role: "assistant",
      content: result.reply,
      findings: result.research?.findings,
      archiveFailed: result.archiveFailed,
      coverageThin: result.coverage?.thin,
      canSearchOutside: result.canSearchOutside,
    },
  ];
}

async function send(host: ChatRailHost, extras: { searchOutside?: boolean } = {}) {
  if (busy) return;
  const outgoing = extras.searchOutside ? "Search outside" : input.trim();
  if (!outgoing && !researchSessionId && !writeSessionId) return;
  const history: ChatTurn[] =
    extras.searchOutside || researchSessionId || writeSessionId
      ? turns
      : [...turns, { role: "user", content: outgoing }];
  if (!extras.searchOutside && !researchSessionId && !writeSessionId) {
    turns = history;
    input = "";
  }
  busy = true;
  error = "";
  if (!researchSessionId && !writeSessionId && !extras.searchOutside) {
    ticks = [];
    pushTick("searching");
  }
  persist();
  host.render();
  try {
    const result = await runChat(
      {
        hat,
        scope,
        depth,
        messages: history.map(({ role, content }) => ({ role, content })),
        workingThesis: thesis || undefined,
        draft: draft || undefined,
        noteContext,
        searchOutside: extras.searchOutside,
        researchSessionId: researchSessionId || undefined,
        writeSessionId: writeSessionId || undefined,
      },
      phase => {
        if (phase.status === "compose") {
          pushTick(phase.archiveFailed ? "failed" : "round", phase.research);
        }
        if (phase.status === "writing") pushTick("writing", phase.research);
        if (phase.status === "researching" && phase.research) pushTick("round", phase.research);
        persist();
        host.render();
      },
    );
    applyResult(history, result);
  } catch (caught) {
    if (caught instanceof ChatWriteDroppedError && caught.research?.findings?.length) {
      turns = [
        ...history,
        {
          role: "assistant",
          content: caught.message,
          findings: caught.research.findings,
        },
      ];
      error = caught.message;
    } else {
      if (!researchSessionId && !extras.searchOutside) input = outgoing;
      error = caught instanceof Error ? caught.message : "Chat failed";
    }
  } finally {
    busy = false;
    persist();
    host.render();
    if (researchSessionId || writeSessionId) {
      pollTimer = setTimeout(() => void send(host), 2000);
    }
  }
}

async function saveBrief(host: ChatRailHost) {
  const last = lastAssistant();
  if (!last || !briefIsSavable(last.content) || saveBusy) return;
  saveBusy = true;
  host.render();
  try {
    const page = briefToPage({
      reply: last.content,
      findings: last.findings ?? [],
      now: new Date().toISOString(),
      id: newHubPageId(),
    });
    const saved = await savePage(page);
    try {
      await tidyPage(saved.id, saved.updated_at);
    } catch {
      /* page exists; tags can wait */
    }
    showToast("Saved as a new page");
    await host.onSavedPage?.(saved);
  } catch (caught) {
    showToast(caught instanceof Error ? caught.message : "Save failed");
  } finally {
    saveBusy = false;
    host.render();
  }
}

export function renderChatRail(host: ChatRailHost) {
  restore();
  if ((researchSessionId || writeSessionId) && !pollTimer) pollTimer = setTimeout(() => void send(host), 400);
  const current = hatById(hat);
  const last = lastAssistant();
  const canSave = Boolean(last && briefIsSavable(last.content));
  const writing = hat === "writing";
  host.shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · Chat needs the Netlify API (session + Anthropic). The browser never talks to the research kernel.</p>` : ""}
    ${host.pageHeader("Professor Clementine Haig", "Chat")}
    <section class="coach chat">
      <form class="coach__form glass-panel">
        <p class="chat__picker-label">How should she work</p>
        <div class="graph-modes" role="group" aria-label="Chat hats">
          ${CHAT_HATS.map(
            item =>
              `<button type="button" data-hat="${item.id}" class="${hat === item.id ? "is-active" : ""}">${escapeHtml(item.label)}</button>`,
          ).join("")}
        </div>
        ${
          noteContext
            ? `<p class="alchemist__mode">Using: ${escapeHtml(noteContext.title)} <button type="button" data-clear-note class="chat__text-btn">Clear</button></p>`
            : ""
        }
        <button type="button" class="chat__dials-toggle" data-toggle-dials>${showDials ? "Hide scope and depth" : "Adjust scope and depth"}</button>
        ${
          showDials
            ? `<div class="chat__dials">
                <label for="chat-scope">Scope</label>
                <select id="chat-scope">
                  ${SCOPES.map(item => `<option value="${item}" ${ (scope ?? current.defaultScope) === item ? "selected" : ""}>${label(item)}</option>`).join("")}
                </select>
                <label for="chat-depth">Depth</label>
                <select id="chat-depth">
                  ${DEPTHS.map(item => `<option value="${item}" ${ (depth ?? current.defaultDepth) === item ? "selected" : ""}>${label(item)}</option>`).join("")}
                </select>
              </div>`
            : `<p class="alchemist__mode">${escapeHtml(label(scope ?? current.defaultScope))} · ${escapeHtml(label(depth ?? current.defaultDepth))}</p>`
        }
        ${
          writing
            ? `<label for="chat-thesis">Working thesis</label>
               <input id="chat-thesis" value="${escapeHtml(thesis)}" placeholder="The claim, in one sentence" />
               <label for="chat-draft">Draft</label>
               <textarea id="chat-draft" rows="6" placeholder="Paste a section…">${escapeHtml(draft)}</textarea>`
            : ""
        }
        <label for="chat-input">Message</label>
        <textarea id="chat-input" rows="4" placeholder="Ask about the archive…">${escapeHtml(input)}</textarea>
        <div class="alchemist__actions">
          <button type="submit" ${busy || researchSessionId || writeSessionId ? "disabled" : ""}>${busy || researchSessionId || writeSessionId ? "Still working…" : "Send"}</button>
          ${canSave ? `<button type="button" data-save-brief ${saveBusy ? "disabled" : ""}>${saveBusy ? "Saving…" : "Save as new page"}</button>` : ""}
        </div>
        ${error ? `<p class="alchemist__error">${escapeHtml(error)}</p>` : ""}
        ${
          ticks.length
            ? `<ol class="chat__ticker" aria-live="polite">${ticks
                .map(line => `<li>${escapeHtml(line)}</li>`)
                .join("")}</ol>`
            : ""
        }
      </form>
      <div class="coach__thread" aria-live="polite">
        ${
          turns.length
            ? turns
                .map(
                  turn => `<article class="coach-msg coach-msg--${turn.role} glass-panel">
                    <p class="coach-msg__who">${turn.role === "user" ? "You" : "Clementine"}</p>
                    <p class="coach-msg__body">${escapeHtml(turn.content)}</p>
                    ${turn.archiveFailed ? `<p class="alchemist__error">Archive pull failed this turn — she continued with what she had.</p>` : ""}
                    ${turn.coverageThin ? `<p class="alchemist__mode">Coverage is thin.</p>` : ""}
                    ${
                      turn.canSearchOutside
                        ? `<button type="button" data-search-outside ${busy || researchSessionId || writeSessionId ? "disabled" : ""}>Search outside</button>`
                        : ""
                    }
                    ${turn.findings?.length ? `<div class="coach-msg__citations">${host.findingCards(turn.findings)}</div>` : ""}
                  </article>`,
                )
                .join("")
            : `<p class="empty">${current.plan}</p>`
        }
      </div>
    </section>
  `);

  const form = host.app.querySelector("form")!;
  host.app.querySelectorAll<HTMLButtonElement>("[data-hat]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.hat;
      if (!next || !isChatHatId(next) || next === hat) return;
      hat = next;
      scope = undefined;
      depth = undefined;
      resetSitting();
      host.render();
    };
  });
  host.app.querySelector<HTMLButtonElement>("[data-toggle-dials]")!.onclick = () => {
    showDials = !showDials;
    persist();
    host.render();
  };
  host.app.querySelector<HTMLButtonElement>("[data-clear-note]")?.addEventListener("click", () => {
    noteContext = undefined;
    persist();
    host.render();
  });
  const scopeEl = host.app.querySelector<HTMLSelectElement>("#chat-scope");
  const depthEl = host.app.querySelector<HTMLSelectElement>("#chat-depth");
  if (scopeEl) {
    scopeEl.onchange = () => {
      scope = scopeEl.value as ChatScope;
      persist();
    };
  }
  if (depthEl) {
    depthEl.onchange = () => {
      depth = depthEl.value as ChatDepth;
      persist();
    };
  }
  const thesisEl = host.app.querySelector<HTMLInputElement>("#chat-thesis");
  const draftEl = host.app.querySelector<HTMLTextAreaElement>("#chat-draft");
  const inputEl = host.app.querySelector<HTMLTextAreaElement>("#chat-input")!;
  if (thesisEl) thesisEl.oninput = () => { thesis = thesisEl.value; };
  if (draftEl) draftEl.oninput = () => { draft = draftEl.value; };
  inputEl.oninput = () => { input = inputEl.value; };
  form.onsubmit = event => {
    event.preventDefault();
    if (thesisEl) thesis = thesisEl.value.trim();
    if (draftEl) draft = draftEl.value;
    input = inputEl.value.trim();
    void send(host);
  };
  host.app.querySelector<HTMLButtonElement>("[data-save-brief]")?.addEventListener("click", () => {
    void saveBrief(host);
  });
  host.app.querySelector<HTMLButtonElement>("[data-search-outside]")?.addEventListener("click", () => {
    void send(host, { searchOutside: true });
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => host.onOpenPage?.(button.dataset.openPage!);
  });
}
