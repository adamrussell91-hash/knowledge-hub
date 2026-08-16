import { USE_LOCAL_DATA, getPage } from "../api/client";
import { getQuizItems, getQuizSchedule, saveQuiz } from "../api/quizClient";
import type { PageManifestEntry } from "../domain/page";
import { escapeHtml } from "../lib/dom";
import { hubUtilitiesActionsHtml } from "../lib/hubChrome";
import { mountDumpSort } from "./dumpCanvas";
import { dumpSessionToQuiz, sortThenDumpPeek, type DumpNode } from "./dumpSort";
import { harvestPage, pagesToHarvest } from "./harvest";
import { buildSprintQueue, cardCapForDuration } from "./queue";
import { applyRating } from "./review";
import {
  toScheduleEntry,
  type DumpSnapshot,
  type QuizEdge,
  type QuizItem,
  type QuizRating,
  type QuizScheduleEntry,
} from "./schema";
import { replaceTopicEdges, upsertDump } from "./store";
import { connectionBoard, filterSchedule, groupByStatus, statusTone } from "./statusGraph";

export const QUIZ_VIEW = "quiz" as const;

export type QuizMode = "sprint" | "hqe" | "why" | "cloze" | "exam" | "dump" | "sortDump" | "map";
export type QuizPhase = "home" | "card" | "summary" | "dump";

export type QuizRailHost = {
  app: HTMLElement;
  entries: PageManifestEntry[];
  tags: string[];
  shell: (main: string) => void;
  render: () => void;
  onOpenPage: (pageId: string) => void;
};

let host: QuizRailHost | null = null;
let quizDuration: 5 | 15 | 30 = 15;
let quizArea: "all" | "university" | "notes" = "all";
let quizTags: string[] = [];
let quizCram = false;
let quizPhase: QuizPhase = "home";
let quizMode: QuizMode = "sprint";
let quizBusy = false;
let quizError = "";
let quizSchedule: QuizScheduleEntry[] = [];
let quizEdges: QuizEdge[] = [];
let quizDumps: DumpSnapshot[] = [];
let quizDumpPeek: DumpNode[] = [];
let quizQueue: QuizItem[] = [];
let quizChanged: QuizItem[] = [];
let quizIndex = 0;
let quizRevealed = false;
let quizExplain = "";
let quizRatings: Record<QuizRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
let quizTimer: number | null = null;
let quizEndsAt = 0;
let quizRemainingMs = 0;
let quizDumpTopic = "";
let quizMapSelected = "";
let dumpTeardown: (() => void) | null = null;
let visibilityBound = false;

export function enterQuizRail() {
  bindVisibility();
  void loadQuizHome();
}

export function leaveQuizRail() {
  stopQuizTimer();
  if (dumpTeardown) {
    dumpTeardown();
    dumpTeardown = null;
  }
}

export function renderQuizRail(next: QuizRailHost) {
  host = next;
  renderQuiz();
}

function bindVisibility() {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && quizChanged.length) void persistQuizProgress();
  });
}

function quizScope() {
  const tags = quizTags.filter(Boolean);
  return {
    area: quizArea === "all" ? undefined : quizArea,
    tags: tags.length ? tags : undefined,
    durationMinutes: quizDuration,
    cram: quizMode === "exam" ? true : quizCram,
    interleave: quizMode === "exam",
    ...(quizMode === "hqe" || quizMode === "why" ? { kinds: ["qa" as const] } : {}),
    ...(quizMode === "cloze" ? { kinds: ["cloze" as const] } : {}),
    ...(quizMode === "why" ? { whyHow: true } : {}),
  };
}

function quizEyebrow() {
  if (quizMode === "dump") return "Dump and Sort";
  if (quizMode === "sortDump") return "Sort then dump";
  if (quizMode === "map") return "Understanding map";
  if (quizMode === "hqe") return "Highlight-Question-Explain";
  if (quizMode === "why") return "Why / How drill";
  if (quizMode === "cloze") return "Quote cloze";
  if (quizMode === "exam") return "Exam mix";
  return "Retrieval sprint";
}

function isExplainMode() {
  return quizMode === "hqe" || quizMode === "why";
}

function isDumpMode() {
  return quizMode === "dump" || quizMode === "sortDump";
}

function stopQuizTimer() {
  if (quizTimer !== null) {
    window.clearInterval(quizTimer);
    quizTimer = null;
  }
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function rerender() {
  host?.render();
}

async function loadQuizHome() {
  quizPhase = "home";
  quizError = "";
  quizBusy = true;
  rerender();
  try {
    const store = await getQuizSchedule();
    quizSchedule = store.schedule;
    quizEdges = store.edges ?? [];
    quizDumps = store.dumps ?? [];
  } catch {
    quizError = "Could not load quiz progress.";
  } finally {
    quizBusy = false;
    rerender();
  }
}

async function persistQuizProgress() {
  if (!quizChanged.length) return;
  try {
    await saveQuiz({ schedule: quizSchedule, items: quizChanged, edges: quizEdges, dumps: quizDumps });
  } catch {
    quizError = "Could not save quiz progress.";
    rerender();
  }
}

async function startQuizSprint() {
  const current = host;
  if (!current) return;
  quizBusy = true;
  quizError = "";
  quizChanged = [];
  quizRatings = { 1: 0, 2: 0, 3: 0, 4: 0 };
  quizIndex = 0;
  quizRevealed = false;
  quizExplain = "";
  rerender();
  try {
    const store = await getQuizSchedule();
    quizSchedule = store.schedule;
    quizEdges = store.edges ?? quizEdges;
    quizDumps = store.dumps ?? quizDumps;
    const cap = cardCapForDuration(quizDuration);
    let queue = buildSprintQueue(quizSchedule, quizScope());
    if (queue.length < cap) {
      const known = new Set(quizSchedule.map(entry => entry.page_id));
      const candidates = pagesToHarvest(current.entries, known, {
        area: quizScope().area,
        tags: quizScope().tags,
        limit: 15,
      });
      for (const entry of candidates) {
        try {
          const harvested = harvestPage(await getPage(entry.id));
          for (const item of harvested) {
            quizSchedule = quizSchedule.filter(row => row.id !== item.id);
            quizSchedule.push(toScheduleEntry(item));
            quizChanged.push(item);
          }
        } catch {
          /* skip unread pages */
        }
      }
      queue = buildSprintQueue(quizSchedule, quizScope());
    }
    const byId = new Map<string, QuizItem>();
    for (const item of quizChanged) byId.set(item.id, item);
    const pageIds = [...new Set(queue.map(entry => entry.page_id))];
    for (const pageId of pageIds) {
      const items = await getQuizItems(pageId);
      for (const item of items) byId.set(item.id, item);
    }
    quizQueue = queue.map(entry => byId.get(entry.id)).filter((item): item is QuizItem => Boolean(item));
    if (!quizQueue.length) {
      quizPhase = "home";
      quizError =
        quizMode === "hqe"
          ? "No HQE pairs in this scope. Add Q: / A: (or Question / Explain) blocks to notes."
          : quizMode === "why"
            ? "No Why/How questions in this scope. Add Q: lines that ask why or how."
            : quizMode === "cloze"
              ? "No quotes to cloze. Add > blockquotes with several long words."
              : quizMode === "exam"
                ? "Nothing to mix in this scope. Harvest found no testable units."
                : "Nothing due in this scope. Harvest found no testable units — add Q:/A: pairs to notes, or widen tags.";
      return;
    }
    quizPhase = "card";
    quizEndsAt = Date.now() + quizDuration * 60 * 1000;
    quizRemainingMs = quizEndsAt - Date.now();
    stopQuizTimer();
    quizTimer = window.setInterval(() => {
      quizRemainingMs = quizEndsAt - Date.now();
      if (quizRemainingMs <= 0) {
        void endQuizSprint();
        return;
      }
      const clock = host?.app.querySelector("[data-quiz-clock]");
      if (clock) clock.textContent = formatRemaining(quizRemainingMs);
    }, 1000);
  } catch {
    quizError = "Could not start a sprint.";
    quizPhase = "home";
  } finally {
    quizBusy = false;
    rerender();
  }
}

async function rateQuizCard(rating: QuizRating) {
  const current = quizQueue[quizIndex];
  if (!current) return;
  const next = applyRating(current, rating);
  quizQueue[quizIndex] = next;
  quizChanged = [...quizChanged.filter(item => item.id !== next.id), next];
  quizSchedule = [...quizSchedule.filter(entry => entry.id !== next.id), toScheduleEntry(next)];
  quizRatings[rating] += 1;
  quizRevealed = false;
  quizExplain = "";
  if (quizIndex + 1 >= quizQueue.length) {
    await endQuizSprint();
    return;
  }
  quizIndex += 1;
  rerender();
}

async function endQuizSprint() {
  stopQuizTimer();
  quizBusy = true;
  rerender();
  await persistQuizProgress();
  quizBusy = false;
  quizPhase = "summary";
  rerender();
}

function understandingMapHtml(tags: string[]) {
  const scoped = filterSchedule(quizSchedule, {
    area: quizArea === "all" ? undefined : quizArea,
    tags: quizTags.length ? quizTags : undefined,
  });
  const grouped = groupByStatus(scoped);
  const board = connectionBoard(scoped, quizEdges);
  const selected = scoped.find(entry => entry.id === quizMapSelected);
  const columns: { key: keyof typeof grouped; title: string }[] = [
    { key: "untested", title: "Untested" },
    { key: "decaying", title: "Decaying" },
    { key: "failed", title: "Failed" },
    { key: "verified", title: "Verified" },
  ];
  return `<section class="understand">
    <div class="alchemist__form glass-panel understand__filters">
      <label for="map-area">Area</label>
      <select id="map-area">
        <option value="all" ${quizArea === "all" ? "selected" : ""}>All</option>
        <option value="university" ${quizArea === "university" ? "selected" : ""}>University</option>
        <option value="notes" ${quizArea === "notes" ? "selected" : ""}>Notes</option>
      </select>
      ${
        tags.length
          ? `<fieldset class="alchemist__mode"><legend>Tags</legend>${tags
              .map(
                tag =>
                  `<label><input type="checkbox" data-quiz-tag="${escapeHtml(tag)}" ${quizTags.includes(tag) ? "checked" : ""} /> ${escapeHtml(tag)}</label>`,
              )
              .join(" ")}</fieldset>`
          : ""
      }
    </div>
    ${
      scoped.length
        ? `<div class="understand__grid">
        ${columns
          .map(
            column => `<section class="understand__col">
              <h2>${column.title} <span>${grouped[column.key].length}</span></h2>
              <div class="understand__pills">
                ${
                  grouped[column.key].length
                    ? grouped[column.key]
                        .map(
                          entry =>
                            `<button type="button" class="understand__pill understand__pill--${statusTone(entry.status)} ${quizMapSelected === entry.id ? "is-selected" : ""}" data-map-item="${escapeHtml(entry.id)}">${escapeHtml(entry.cue_preview)}</button>`,
                        )
                        .join("")
                    : `<p class="empty">None</p>`
                }
              </div>
            </section>`,
          )
          .join("")}
      </div>
      <div class="understand__board" aria-label="Dump connections">
        <svg class="understand__board-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${board.edges
          .map(edge => {
            const a = board.nodes.find(node => node.id === edge.from);
            const b = board.nodes.find(node => node.id === edge.to);
            if (!a || !b) return "";
            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
          })
          .join("")}</svg>
        ${board.nodes
          .map(
            node =>
              `<button type="button" class="understand__node understand__pill--${node.tone} ${quizMapSelected === node.id ? "is-selected" : ""}" style="left:${node.x}%;top:${node.y}%" data-map-item="${escapeHtml(node.id)}">${escapeHtml(node.cue_preview)}</button>`,
          )
          .join("")}
      </div>
      ${selected ? `<p class="understand__detail glass-panel">${escapeHtml(selected.cue_preview)} · ${selected.area} · ${escapeHtml(selected.tags.join(", ") || "no tags")}</p>` : ""}`
        : `<p class="empty">Run a sprint or Dump and Sort first. Untested stays blue, verified goes black, decay and failure go orange.</p>`
    }
  </section>`;
}

function renderQuiz() {
  const currentHost = host;
  if (!currentHost) return;
  if (quizPhase !== "dump" && dumpTeardown) {
    dumpTeardown();
    dumpTeardown = null;
  }
  const tags = currentHost.tags;
  const current = quizQueue[quizIndex];
  const remaining = Math.max(0, quizQueue.length - quizIndex);
  const sprintHome =
    quizPhase === "home" &&
    (quizMode === "sprint" || quizMode === "hqe" || quizMode === "why" || quizMode === "cloze" || quizMode === "exam");
  currentHost.shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · quiz progress stays in this browser until you use the live API.</p>` : ""}
    <header class="topbar page-header">
      <div class="page-header__copy">
        <p class="eyebrow page-header__eyebrow">${quizEyebrow()}</p>
        <h1 class="page-header__title">Quiz</h1>
      </div>
      ${hubUtilitiesActionsHtml()}
    </header>
    ${
      quizPhase === "home" || quizPhase === "dump"
        ? `<div class="quiz-modes">
      <button type="button" data-quiz-mode="sprint" class="${quizMode === "sprint" ? "is-active" : ""}">Sprint</button>
      <button type="button" data-quiz-mode="hqe" class="${quizMode === "hqe" ? "is-active" : ""}">HQE</button>
      <button type="button" data-quiz-mode="why" class="${quizMode === "why" ? "is-active" : ""}">Why/How</button>
      <button type="button" data-quiz-mode="cloze" class="${quizMode === "cloze" ? "is-active" : ""}">Cloze</button>
      <button type="button" data-quiz-mode="exam" class="${quizMode === "exam" ? "is-active" : ""}">Exam</button>
      <button type="button" data-quiz-mode="dump" class="${quizMode === "dump" ? "is-active" : ""}">Dump</button>
      <button type="button" data-quiz-mode="sortDump" class="${quizMode === "sortDump" ? "is-active" : ""}">Sort→Dump</button>
      <button type="button" data-quiz-mode="map" class="${quizMode === "map" ? "is-active" : ""}">Map</button>
    </div>`
        : ""
    }
    ${
      sprintHome
        ? `<section class="alchemist">
      <form class="alchemist__form glass-panel">
        <label for="quiz-duration">Session length</label>
        <select id="quiz-duration">
          <option value="5" ${quizDuration === 5 ? "selected" : ""}>5 minutes</option>
          <option value="15" ${quizDuration === 15 ? "selected" : ""}>15 minutes</option>
          <option value="30" ${quizDuration === 30 ? "selected" : ""}>30 minutes</option>
        </select>
        <label for="quiz-area">Area</label>
        <select id="quiz-area">
          <option value="all" ${quizArea === "all" ? "selected" : ""}>All</option>
          <option value="university" ${quizArea === "university" ? "selected" : ""}>University</option>
          <option value="notes" ${quizArea === "notes" ? "selected" : ""}>Notes</option>
        </select>
        ${
          tags.length
            ? `<fieldset class="alchemist__mode"><legend>Tags (optional)</legend>${tags
                .map(
                  tag =>
                    `<label><input type="checkbox" data-quiz-tag="${escapeHtml(tag)}" ${quizTags.includes(tag) ? "checked" : ""} /> ${escapeHtml(tag)}</label>`,
                )
                .join(" ")}</fieldset>`
            : ""
        }
        ${quizMode === "sprint" ? `<label class="alchemist__mode"><input type="checkbox" data-quiz-cram ${quizCram ? "checked" : ""} /> Ignore due dates</label>` : ""}
        <div class="alchemist__actions">
          <button type="submit" ${quizBusy ? "disabled" : ""}>${quizBusy ? "Preparing…" : quizMode === "hqe" ? "Start HQE" : quizMode === "why" ? "Start Why/How" : quizMode === "cloze" ? "Start cloze" : quizMode === "exam" ? "Start exam" : "Start sprint"}</button>
        </div>
        ${quizError ? `<p class="alchemist__error">${escapeHtml(quizError)}</p>` : ""}
      </form>
      <p class="empty">${
        quizMode === "hqe"
          ? "Cover the notes. Explain from memory. If your explanation is vague, Again. No model grading."
          : quizMode === "why"
            ? "Same cover-and-explain loop, but only why and how questions. Skip the what."
            : quizMode === "cloze"
              ? "Quotes with every other long word blanked. Closer to how exam recall is actually tested."
              : quizMode === "exam"
                ? "Interleaved mix of every kind. Due dates ignored. Thirty minutes is the usual exam length."
                : "Cued recall from your notes. No model calls. Rate honestly after you retrieve."
      }</p>
    </section>`
        : ""
    }
    ${
      quizPhase === "home" && isDumpMode()
        ? `<section class="alchemist">
      <form class="alchemist__form glass-panel" data-dump-start>
        <label for="dump-topic">Topic</label>
        <input id="dump-topic" value="${escapeHtml(quizDumpTopic)}" placeholder="e.g. distributed leadership" required />
        <label for="dump-area">Area for new gap cards</label>
        <select id="dump-area">
          <option value="notes" ${quizArea !== "university" ? "selected" : ""}>Notes</option>
          <option value="university" ${quizArea === "university" ? "selected" : ""}>University</option>
        </select>
        ${
          tags.length
            ? `<fieldset class="alchemist__mode"><legend>Tags (optional)</legend>${tags
                .map(
                  tag =>
                    `<label><input type="checkbox" data-quiz-tag="${escapeHtml(tag)}" ${quizTags.includes(tag) ? "checked" : ""} /> ${escapeHtml(tag)}</label>`,
                )
                .join(" ")}</fieldset>`
            : ""
        }
        <div class="alchemist__actions">
          <button type="submit">${quizMode === "sortDump" ? "Peek, then dump" : "Start dump"}</button>
        </div>
        ${quizError ? `<p class="alchemist__error">${escapeHtml(quizError)}</p>` : ""}
      </form>
      <p class="empty">${
        quizMode === "sortDump"
          ? "See the organised map (last dump, or heading claims), hide it, then reconstruct from memory."
          : "Dump from memory first (black). Check notes and mark gaps in blue. Connect, then save onto the Map."
      }</p>
    </section>`
        : ""
    }
    ${quizPhase === "home" && quizMode === "map" ? understandingMapHtml(tags) : ""}
    ${quizPhase === "dump" ? `<div data-dump-root class="dump-root"></div>` : ""}
    ${
      quizPhase === "card" && current
        ? `<section class="quiz-card glass-panel">
      <p class="quiz-card__meta"><span>${quizIndex + 1} / ${quizQueue.length}</span><span data-quiz-clock>${formatRemaining(quizRemainingMs)}</span><span>${remaining} left</span></p>
      <p class="quiz-card__cue">${escapeHtml(current.cue)}</p>
      ${
        isExplainMode() && !quizRevealed
          ? `<label class="quiz-card__explain-label" for="hqe-explain">Explain from memory</label>
             <textarea id="hqe-explain" rows="6" placeholder="Cover the notes. Use your own words.">${escapeHtml(quizExplain)}</textarea>`
          : ""
      }
      ${
        quizRevealed
          ? `${
              isExplainMode()
                ? `<div class="quiz-card__compare">
                     <div><p class="quiz-card__compare-label">Your explanation</p><p class="quiz-card__answer">${escapeHtml(quizExplain) || "<em>Blank</em>"}</p></div>
                     <div><p class="quiz-card__compare-label">From your notes</p><div class="quiz-card__answer">${escapeHtml(current.answer)}</div></div>
                   </div>
                   <p class="quiz-card__hint">If it was vague, Again.</p>`
                : `<div class="quiz-card__answer">${escapeHtml(current.answer)}</div>`
            }
             <div class="quiz-card__actions">
               <button type="button" data-quiz-rate="1">Again</button>
               <button type="button" data-quiz-rate="2">Hard</button>
               <button type="button" data-quiz-rate="3">Good</button>
               <button type="button" data-quiz-rate="4">Easy</button>
             </div>
             <button type="button" data-open-page="${escapeHtml(current.page_id)}">Open source note →</button>`
          : `<div class="quiz-card__actions"><button type="button" data-quiz-reveal>Reveal</button></div>`
      }
      <div class="quiz-card__actions"><button type="button" data-quiz-end>End sprint</button></div>
      ${quizError ? `<p class="alchemist__error">${escapeHtml(quizError)}</p>` : ""}
    </section>`
        : ""
    }
    ${
      quizPhase === "summary"
        ? `<section class="quiz-card glass-panel">
      <h2>Sprint saved</h2>
      <p>Again ${quizRatings[1]} · Hard ${quizRatings[2]} · Good ${quizRatings[3]} · Easy ${quizRatings[4]}</p>
      <p>Verified ${quizSchedule.filter(entry => entry.status === "verified").length} · Untested ${quizSchedule.filter(entry => entry.status === "untested").length} · Decaying ${quizSchedule.filter(entry => entry.status === "decaying").length} · Failed ${quizSchedule.filter(entry => entry.status === "failed").length}</p>
      ${quizError ? `<p class="alchemist__error">${escapeHtml(quizError)}</p><button type="button" data-quiz-retry>Retry save</button>` : ""}
      <div class="quiz-card__actions"><button type="button" data-quiz-home>Back to Quiz</button></div>
    </section>`
        : ""
    }
  `);

  bindQuiz(currentHost);
}

function bindQuiz(currentHost: QuizRailHost) {
  const { app } = currentHost;
  const duration = app.querySelector<HTMLSelectElement>("#quiz-duration");
  const areaSelect = app.querySelector<HTMLSelectElement>("#quiz-area");
  if (duration) {
    duration.onchange = () => {
      quizDuration = Number(duration.value) as 5 | 15 | 30;
    };
  }
  if (areaSelect) {
    areaSelect.onchange = () => {
      quizArea = areaSelect.value as "all" | "university" | "notes";
    };
  }
  const mapArea = app.querySelector<HTMLSelectElement>("#map-area");
  if (mapArea) {
    mapArea.onchange = () => {
      quizArea = mapArea.value as "all" | "university" | "notes";
      rerender();
    };
  }
  app.querySelectorAll<HTMLInputElement>("[data-quiz-tag]").forEach(box => {
    box.onchange = () => {
      const tag = box.dataset.quizTag!;
      quizTags = box.checked ? [...quizTags, tag] : quizTags.filter(item => item !== tag);
      if (quizMode === "map") rerender();
    };
  });
  const cram = app.querySelector<HTMLInputElement>("[data-quiz-cram]");
  if (cram) {
    cram.onchange = () => {
      quizCram = cram.checked;
    };
  }
  const form = app.querySelector("form");
  if (form) {
    form.onsubmit = async event => {
      event.preventDefault();
      if (isDumpMode()) {
        const topic = app.querySelector<HTMLInputElement>("#dump-topic")?.value.trim() ?? "";
        if (!topic) return;
        quizDumpTopic = topic;
        const dumpArea = app.querySelector<HTMLSelectElement>("#dump-area")?.value;
        quizArea = dumpArea === "university" ? "university" : "notes";
        quizDumpPeek =
          quizMode === "sortDump"
            ? sortThenDumpPeek(
                topic,
                quizDumps,
                quizSchedule.map(entry => ({ cue: entry.cue_preview, kind: entry.kind })),
              )
            : [];
        quizPhase = "dump";
        rerender();
        return;
      }
      await startQuizSprint();
    };
  }
  app.querySelectorAll<HTMLButtonElement>("[data-quiz-mode]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.quizMode as QuizMode | undefined;
      quizMode =
        next === "dump" ||
        next === "sortDump" ||
        next === "map" ||
        next === "hqe" ||
        next === "why" ||
        next === "cloze" ||
        next === "exam"
          ? next
          : "sprint";
      if (quizMode === "exam") quizDuration = 30;
      quizPhase = "home";
      rerender();
    };
  });
  app.querySelector<HTMLTextAreaElement>("#hqe-explain")?.addEventListener("input", event => {
    quizExplain = (event.target as HTMLTextAreaElement).value;
  });
  app.querySelector<HTMLButtonElement>("[data-quiz-reveal]")?.addEventListener("click", () => {
    quizRevealed = true;
    rerender();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-quiz-rate]").forEach(button => {
    button.onclick = () => void rateQuizCard(Number(button.dataset.quizRate) as QuizRating);
  });
  app.querySelector<HTMLButtonElement>("[data-quiz-end]")?.addEventListener("click", () => void endQuizSprint());
  app.querySelector<HTMLButtonElement>("[data-quiz-home]")?.addEventListener("click", () => {
    quizPhase = "home";
    rerender();
  });
  app.querySelector<HTMLButtonElement>("[data-quiz-retry]")?.addEventListener("click", () => void persistQuizProgress());
  app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => currentHost.onOpenPage(button.dataset.openPage!);
  });
  app.querySelectorAll<HTMLButtonElement>("[data-map-item]").forEach(button => {
    button.onclick = () => {
      quizMapSelected = button.dataset.mapItem ?? "";
      rerender();
    };
  });
  const dumpRoot = app.querySelector<HTMLElement>("[data-dump-root]");
  if (dumpRoot && quizPhase === "dump" && !dumpTeardown) {
    dumpTeardown = mountDumpSort(dumpRoot, {
      topic: quizDumpTopic,
      peek: quizDumpPeek,
      sortThenDump: quizMode === "sortDump",
      onCancel: () => {
        dumpTeardown = null;
        quizPhase = "home";
        rerender();
      },
      onSave: payload => {
        void (async () => {
          const result = dumpSessionToQuiz({
            topic: quizDumpTopic,
            nodes: payload.nodes,
            edges: payload.edges,
            area: quizArea === "university" ? "university" : "notes",
            tags: quizTags,
          });
          dumpTeardown = null;
          try {
            const store = await getQuizSchedule();
            quizSchedule = store.schedule;
            quizEdges = store.edges ?? [];
            quizDumps = store.dumps ?? [];
          } catch {
            /* keep in-memory graph */
          }
          quizChanged = result.items;
          for (const item of result.items) {
            quizSchedule = [...quizSchedule.filter(entry => entry.id !== item.id), toScheduleEntry(item)];
          }
          quizEdges = replaceTopicEdges(quizEdges, result.snapshot.page_id, result.edges);
          quizDumps = upsertDump(quizDumps, result.snapshot);
          if (result.items.length) await persistQuizProgress();
          quizPhase = "home";
          quizMode = "map";
          quizError = result.items.length
            ? `Saved ${result.items.length} node${result.items.length === 1 ? "" : "s"} and ${result.edges.length} connection${result.edges.length === 1 ? "" : "s"} onto the Map.`
            : "Nothing to save. Add black or blue nodes, then save.";
          rerender();
        })();
      },
    });
  }
}
