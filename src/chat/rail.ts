import { ChatWriteDroppedError, runChat, savePage, tidyPage, USE_LOCAL_DATA } from "../api/client";
import { newHubPageId } from "../domain/page";
import type { Page } from "../domain/page";
import { escapeHtml, showToast } from "../lib/dom";
import { bindKeyboardInset } from "../lib/keyboardInset";
import { filterPickerOptions, optionPickerListHtml } from "../ui/optionPicker";
import { bookContextLine, bookOrigin, normalizeBookContext, resolveBookLabel, type BookContext } from "./bookNote";
import { CHAT_HATS, DEPTHS, SCOPES, hatById, isChatHatId, resolveChatPlan, type ChatDepth, type ChatHatId, type ChatScope } from "./hats";
import { renderChatMarkdown, type NoteTitle } from "./noteLinks";
import { researchFromFindings, searchedNotesHtml, thinkingHistoryHtml } from "./sources";
import { CLEMENTINE_WAIT_LINES, appendTick, chatTick, pickClementineWaitLine } from "./ticker";
import { briefIsSavable, briefToPage, type SavableFinding } from "./saveBrief";
import type { ChatTurnResult } from "./chatTurn";

export type ChatRailHost = {
  app: HTMLElement;
  shell: (main: string) => void;
  render: () => void;
  onOpenPage?: (pageId: string, title?: string) => void;
  onSavedPage?: (page: Page) => Promise<void> | void;
  onOpenVisualiser?: () => void;
  pageHeader: (eyebrow: string, title: string, actionsInner?: string) => string;
  archiveNotes?: NoteTitle[];
  bookLabels?: string[];
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  findings?: SavableFinding[];
  ticks?: string[];
  archiveFailed?: boolean;
  coverageThin?: boolean;
  canSearchOutside?: boolean;
};

const STORAGE_KEY = "knowledge-hub-chat-v1";

let hat: ChatHatId = "synthesis";
let scope: ChatScope | undefined;
let depth: ChatDepth | undefined;
let showDials = false;
let thesis = "";
let draft = "";
let input = "";
let turns: ChatTurn[] = [];
let noteContext: { pageId: string; title: string } | undefined;
let bookContext: BookContext | undefined;
let bookQuery = "";
let bookOpen = false;
let researchSessionId = "";
let writeSessionId = "";
let busy = false;
let error = "";
let ticks: string[] = [];
let waitLine = CLEMENTINE_WAIT_LINES[0]!;
let thinkingOpen = false;
const sourcesOpen = new Set<number>();
let saveBusy = false;
let savedBrief = false;
let fileAfterDone = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        hat,
        scope,
        depth,
        showDials,
        thesis,
        draft,
        input,
        turns,
        noteContext,
        bookContext,
        researchSessionId,
        writeSessionId,
        ticks,
        waitLine,
        savedBrief,
      }),
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
      bookContext: BookContext;
      researchSessionId: string;
      writeSessionId: string;
      ticks: string[];
      waitLine: string;
      savedBrief: boolean;
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
    bookContext = normalizeBookContext(saved.bookContext);
    savedBrief = Boolean(saved.savedBrief);
    researchSessionId = saved.researchSessionId ?? "";
    writeSessionId = saved.writeSessionId ?? "";
    ticks = Array.isArray(saved.ticks) ? saved.ticks.filter((line): line is string => typeof line === "string") : ticks;
    waitLine = typeof saved.waitLine === "string" && saved.waitLine ? saved.waitLine : waitLine;
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
  waitLine = CLEMENTINE_WAIT_LINES[0]!;
  savedBrief = false;
  fileAfterDone = false;
  persist();
}

export function enterChatRail(
  opts?: { noteContext?: { pageId: string; title: string }; fresh?: boolean; hat?: ChatHatId; bookContext?: BookContext },
) {
  restore();
  if (opts?.fresh) resetSitting();
  if (opts?.hat && isChatHatId(opts.hat)) {
    hat = opts.hat;
    scope = undefined;
    depth = undefined;
  }
  if (opts?.noteContext) noteContext = opts.noteContext;
  if (opts?.bookContext) {
    bookContext = normalizeBookContext(opts.bookContext);
    bookQuery = "";
    bookOpen = false;
  }
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
    bookContext = undefined;
    hat = "synthesis";
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
  phase: "searching" | "library" | "round" | "writing" | "failed",
  research?: { findings?: unknown[]; followUpQueries?: string[]; round?: number },
) {
  const plan = sitting();
  waitLine = pickClementineWaitLine({ exclude: ticks.length ? waitLine : undefined });
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
      waitLine,
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
  waitLine = CLEMENTINE_WAIT_LINES[0]!;
  savedBrief = false;
  turns = [
    ...history,
    {
      role: "assistant",
      content: result.reply,
      findings: result.research?.findings,
      ticks: [...ticks],
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
  if (hat === "fromBook" && !bookContext && !researchSessionId && !writeSessionId && !extras.searchOutside) {
    error = "Pick the book first.";
    persist();
    host.render();
    return;
  }
  const history: ChatTurn[] =
    extras.searchOutside || researchSessionId || writeSessionId
      ? turns
      : [...turns, { role: "user", content: outgoing }];
  if (!extras.searchOutside && !researchSessionId && !writeSessionId) {
    turns = history;
    input = "";
    if (hat === "fromBook") fileAfterDone = true;
  }
  busy = true;
  error = "";
  const sittingLibrary = researchFromFindings(lastAssistant()?.findings ?? []);
  if (!researchSessionId && !writeSessionId && !extras.searchOutside) {
    ticks = [];
    if (sittingLibrary.findings.length) pushTick("library", sittingLibrary);
    else pushTick("searching");
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
        bookContext,
        searchOutside: extras.searchOutside,
        researchSessionId: researchSessionId || undefined,
        writeSessionId: writeSessionId || undefined,
        sittingLibrary: sittingLibrary.findings.length ? sittingLibrary : undefined,
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
    if (fileAfterDone && result.status === "done" && hat === "fromBook") {
      fileAfterDone = false;
      busy = false;
      persist();
      host.render();
      await saveBrief(host);
      return;
    }
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
      fileAfterDone = false;
    } else {
      if (!researchSessionId && !extras.searchOutside) {
        input = outgoing;
        turns = history.slice(0, -1);
      }
      error = caught instanceof Error ? caught.message : "Chat failed";
      if (!researchSessionId && !writeSessionId) fileAfterDone = false;
    }
  } finally {
    busy = false;
    if (!researchSessionId && !writeSessionId) waitLine = CLEMENTINE_WAIT_LINES[0]!;
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
    const origin = bookOrigin(bookContext);
    const page = briefToPage({
      reply: last.content,
      findings: last.findings ?? [],
      now: new Date().toISOString(),
      id: newHubPageId(),
      origins: origin ? [origin] : undefined,
    });
    const saved = await savePage(page);
    try {
      await tidyPage(saved.id, saved.updated_at);
    } catch {
      /* page exists; tags can wait */
    }
    savedBrief = true;
    showToast(origin ? `Added to the archive under ${origin.label}` : "Saved as a new page");
    await host.onSavedPage?.(saved);
  } catch (caught) {
    showToast(caught instanceof Error ? caught.message : "Save failed");
  } finally {
    saveBusy = false;
    host.render();
  }
}

function setBook(label: string, locus = bookContext?.locus ?? "", catalog: string[] = []) {
  bookContext = normalizeBookContext({ label: resolveBookLabel(label, catalog), locus });
  bookQuery = "";
  bookOpen = false;
  if (bookContext && error === "Pick the book first.") error = "";
}

function bookFieldHtml(bookLabels: string[]) {
  if (hat !== "fromBook") return "";
  if (bookContext) {
    return `<div class="chat__book">
      <p class="alchemist__mode">${escapeHtml(bookContextLine(bookContext))} <button type="button" data-clear-book class="chat__text-btn">Change</button></p>
      <label for="chat-book-locus">Page or passage</label>
      <input id="chat-book-locus" value="${escapeHtml(bookContext.locus ?? "")}" placeholder="p. 142, or a short quote" autocomplete="off" />
    </div>`;
  }
  const matches = filterPickerOptions(bookLabels, bookQuery);
  return `<div class="chat__book">
    <label for="chat-book">Book</label>
    <p class="compose__hint">The one in your hand. Pick a title you already use, or type a new one.</p>
    <div class="chat__book-add">
      <input id="chat-book" value="${escapeHtml(bookQuery)}" placeholder="Make It Stick…" autocomplete="off" list="chat-book-list" />
      <datalist id="chat-book-list">${bookLabels.map(item => `<option value="${escapeHtml(item)}"></option>`).join("")}</datalist>
      <button type="button" class="btn btn--ghost" data-set-book>Use this book</button>
    </div>
    ${
      bookOpen || bookQuery
        ? `<div data-book-list>${optionPickerListHtml({
            options: matches,
            optionAttr: "data-book-option",
            emptyLabel: bookQuery.trim() ? "No matching title. Use this book to add it." : "No books on file yet.",
          })}</div>`
        : bookLabels.length
          ? `<button type="button" class="tag-pill option-picker__add" data-open-books>Choose from the archive</button>`
          : ""
    }
  </div>`;
}

function saveCardHtml(canSave: boolean) {
  if (!canSave || savedBrief) return "";
  if (hat === "fromBook") {
    const book = bookContext?.label ? escapeHtml(bookContext.label) : "this book";
    if (saveBusy) {
      return `<p class="alchemist__mode">Filing under ${book}…</p>`;
    }
    return `<section class="confirm-card" role="region" aria-label="Add to archive">
      <p class="page-header__eyebrow">Add to archive</p>
      <h2 class="page-header__title" style="font-size: var(--text-lg)">File this page</h2>
      <p class="page-header__supporting">Referenced, and stamped under ${book}.</p>
      <div class="confirm-card__actions">
        <button class="btn btn--primary" type="button" data-save-brief>Add to archive</button>
      </div>
    </section>`;
  }
  return `<div class="alchemist__actions chat__save-row">
    <button class="btn btn--secondary" type="button" data-save-brief ${saveBusy ? "disabled" : ""}>${saveBusy ? "Saving…" : "Save as new page"}</button>
  </div>`;
}

function noteComposerHtml(fromBook: boolean, placeholder: string) {
  const submitLabel = busy || researchSessionId || writeSessionId
    ? escapeHtml(waitLine)
    : fromBook
      ? "Make note"
      : "Send";
  return `<form class="coach__form ${fromBook ? "chat__note-form" : "glass-panel chat__composer"}" novalidate>
    <label for="chat-input">${fromBook ? "Note from the page" : "Message"}</label>
    <textarea id="chat-input" rows="${fromBook ? 4 : 3}" placeholder="${escapeHtml(placeholder)}" ${busy || researchSessionId || writeSessionId ? "disabled" : ""}>${escapeHtml(input)}</textarea>
    <div class="alchemist__actions">
      <button class="btn btn--primary" type="submit" ${busy || researchSessionId || writeSessionId ? "disabled" : ""}>${submitLabel}</button>
    </div>
    ${error ? `<p class="alchemist__error">${escapeHtml(error)}</p>` : ""}
    ${busy || researchSessionId || writeSessionId ? `<p class="chat__status" aria-live="polite">${escapeHtml(waitLine)}</p>` : ""}
    ${busy || researchSessionId || writeSessionId ? thinkingHistoryHtml(ticks, thinkingOpen) : ""}
  </form>`;
}

export function renderChatRail(host: ChatRailHost) {
  restore();
  bindKeyboardInset();
  if ((researchSessionId || writeSessionId) && !pollTimer) pollTimer = setTimeout(() => void send(host), 400);
  const current = hatById(hat);
  const last = lastAssistant();
  const canSave = Boolean(last && briefIsSavable(last.content));
  const writing = hat === "writing";
  const fromBook = hat === "fromBook";
  const placeholder = fromBook
    ? "The idea, term, or question from the page…"
    : "Ask about the archive…";
  const bookLabels = host.bookLabels ?? [];
  const threadHtml = turns.length
    ? turns
        .map((turn, index) => {
          const lastTurn = index === turns.length - 1;
          const body =
            turn.role === "assistant"
              ? `<div class="coach-msg__body">${renderChatMarkdown(turn.content, turn.findings, host.archiveNotes)}</div>`
              : `<div class="coach-msg__body coach-msg__body--plain">${escapeHtml(turn.content)}</div>`;
          return `<article class="coach-msg coach-msg--${turn.role} glass-panel">
                    <p class="coach-msg__who">${turn.role === "user" ? "You" : "Clementine"}</p>
                    ${body}
                    ${turn.archiveFailed ? `<p class="alchemist__error">Archive pull failed this turn — she continued with what she had.</p>` : ""}
                    ${turn.coverageThin ? `<p class="alchemist__mode">Coverage is thin.</p>` : ""}
                    ${
                      turn.canSearchOutside
                        ? `<button type="button" data-search-outside ${busy || researchSessionId || writeSessionId ? "disabled" : ""}>Search outside</button>`
                        : ""
                    }
                    ${turn.role === "assistant" && turn.ticks?.length ? thinkingHistoryHtml(turn.ticks, thinkingOpen && lastTurn) : ""}
                    ${turn.findings?.length ? searchedNotesHtml(turn.findings, sourcesOpen.has(index), index) : ""}
                    ${lastTurn && turn.role === "assistant" ? saveCardHtml(canSave) : ""}
                  </article>`;
        })
        .join("")
    : fromBook
      ? ""
      : `<p class="empty">${current.plan}</p>`;
  host.shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · Chat needs the Netlify API (session + Anthropic). The browser never talks to the research kernel.</p>` : ""}
    ${host.pageHeader(
      "Professor Clementine Haig",
      fromBook ? "From a book" : "Chat",
      `<button class="btn btn--ghost" data-open-visualiser type="button">Portrait ideas</button>
      <button class="btn btn--ghost" data-new-chat type="button" ${busy || researchSessionId || writeSessionId ? "disabled" : ""}>New chat</button>`,
    )}
    <section class="coach chat${fromBook ? " chat--from-book" : ""}">
      <div class="chat__sitting glass-panel">
        <div class="graph-modes chat__hats" role="group" aria-label="Chat hats">
          ${CHAT_HATS.map(
            item =>
              `<button type="button" data-hat="${item.id}" class="${hat === item.id ? "is-active" : ""}" aria-describedby="chat-hat-tip-${item.id}"><span>${escapeHtml(item.label)}</span><span class="agent-protocol-pills__tip" id="chat-hat-tip-${item.id}" role="tooltip">${escapeHtml(item.explain)}</span></button>`,
          ).join("")}
        </div>
        ${
          noteContext
            ? `<p class="alchemist__mode">Using: ${escapeHtml(noteContext.title)} <button type="button" data-clear-note class="chat__text-btn">Clear</button></p>`
            : ""
        }
        ${bookFieldHtml(bookLabels)}
        ${fromBook ? noteComposerHtml(true, placeholder) : ""}
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
      </div>
      <div class="coach__thread" aria-live="polite">
        ${threadHtml}
      </div>
      ${fromBook ? "" : noteComposerHtml(false, placeholder)}
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
  host.app.querySelector<HTMLButtonElement>("[data-open-visualiser]")?.addEventListener("click", () => {
    host.onOpenVisualiser?.();
  });
  host.app.querySelector<HTMLButtonElement>("[data-new-chat]")?.addEventListener("click", () => {
    if (busy || researchSessionId || writeSessionId) return;
    resetSitting();
    noteContext = undefined;
    thinkingOpen = false;
    sourcesOpen.clear();
    persist();
    host.render();
  });
  host.app.querySelector<HTMLButtonElement>("[data-clear-book]")?.addEventListener("click", () => {
    bookContext = undefined;
    bookQuery = "";
    bookOpen = true;
    persist();
    host.render();
  });
  host.app.querySelector<HTMLButtonElement>("[data-open-books]")?.addEventListener("click", () => {
    bookOpen = true;
    persist();
    host.render();
  });
  const applyBook = (label: string) => {
    setBook(label, bookContext?.locus, host.bookLabels ?? []);
    persist();
    host.render();
  };
  host.app.querySelector<HTMLButtonElement>("[data-set-book]")?.addEventListener("click", () => {
    const field = host.app.querySelector<HTMLInputElement>("#chat-book");
    applyBook(field?.value ?? bookQuery);
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-book-option]").forEach(button => {
    button.onclick = () => applyBook(button.dataset.bookOption ?? "");
  });
  const bookEl = host.app.querySelector<HTMLInputElement>("#chat-book");
  if (bookEl) {
    bookEl.oninput = () => {
      bookQuery = bookEl.value;
      bookOpen = true;
      const list = host.app.querySelector("[data-book-list]");
      if (!list) return;
      list.innerHTML = optionPickerListHtml({
        options: filterPickerOptions(host.bookLabels ?? [], bookQuery),
        optionAttr: "data-book-option",
        emptyLabel: bookQuery.trim() ? "No matching title. Use this book to add it." : "No books on file yet.",
      });
      host.app.querySelectorAll<HTMLButtonElement>("[data-book-option]").forEach(button => {
        button.onclick = () => applyBook(button.dataset.bookOption ?? "");
      });
    };
    bookEl.onkeydown = event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyBook(bookEl.value);
    };
  }
  const locusEl = host.app.querySelector<HTMLInputElement>("#chat-book-locus");
  if (locusEl) {
    locusEl.oninput = () => {
      if (!bookContext) return;
      bookContext = normalizeBookContext({ label: bookContext.label, locus: locusEl.value }) ?? bookContext;
      persist();
    };
  }
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
  host.app.querySelectorAll<HTMLElement>("[data-open-page]").forEach(el => {
    el.addEventListener("click", event => {
      event.preventDefault();
      host.onOpenPage?.(el.dataset.openPage!, el.textContent?.trim());
    });
  });
  host.app.querySelectorAll<HTMLDetailsElement>("[data-thinking-history]").forEach(el => {
    el.ontoggle = () => {
      thinkingOpen = el.open;
    };
  });
  host.app.querySelectorAll<HTMLDetailsElement>("[data-searched-notes]").forEach(el => {
    el.ontoggle = () => {
      const turn = Number(el.dataset.searchedNotes);
      if (Number.isNaN(turn)) return;
      if (el.open) sourcesOpen.add(turn);
      else sourcesOpen.delete(turn);
    };
  });
}
