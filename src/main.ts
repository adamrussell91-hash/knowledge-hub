import "./tokens.css";
import "./style.css";
import type { Attachment, Page, PageManifestEntry } from "./domain/page";
import { newHubPageId, parseTagList } from "./domain/page";
import {
  USE_LOCAL_DATA,
  getAttachmentUrl,
  getPage,
  listPages,
  login,
  logout,
  runCoach,
  savePage,
  searchPages,
  signAttachment,
  tidyPage,
  uploadSignedFile,
  type CoachMessage,
} from "./api/client";
import { isPageHash, pageHashForId, pageIdFromHash } from "./routing/pageHash";
import { runCapture } from "./api/captureClient";
import {
  bindCaptureControls,
  captureFieldHtml,
  createVoiceCapture,
  ingestCaptureFile,
} from "./capture";
import type { ResearchFinding } from "./research/schema";
import { escapeHtml, showToast } from "./lib/dom";
import { hubUtilitiesHtml } from "./lib/hubChrome";
import { renderMarkdown } from "./lib/markdown";
import { archiveEmptyHtml } from "./archive/emptyList";
import { goHome } from "./archive/goHome";
import { searchCluster } from "./archive/graphFocus";
import { mountGraphPreview } from "./archive/graphPreview";
import { buildArchiveGraph, topicKeywords } from "./archive/keywordGraph";
import { mountForceGraph } from "./archive/forceGraph";
import { buildShowAllGraph } from "./archive/showAllGraph";
import { buildUniverseGraph } from "./archive/universeGraph";
import { mountUniverseView, universeHotIds } from "./archive/universeView";
import { enterPodcastRail, leavePodcastRail, renderPodcastRail } from "./podcast/rail";
import { enterQuizRail, leaveQuizRail, renderQuizRail } from "./quiz/view";
import { enterWikiRail, leaveWikiRail, renderWikiRail } from "./wiki/rail";
import { connectedLinksHtml } from "./wiki/connectedHtml";

type View =
  | "list"
  | "graph"
  | "page"
  | "compose"
  | "coach"
  | "podcast"
  | "quiz"
  | "wiki";
type GraphMode = "constellation" | "showAll" | "universe";

type CoachTurn = CoachMessage & {
  findings?: ResearchFinding[];
  archiveFailed?: boolean;
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const ROW_HEIGHT = 68;
const OVERSCAN = 8;

let entries: PageManifestEntry[] = [];
let visible: PageManifestEntry[] = [];
let view: View = "list";
let query = "";
let keywordFilter = "";
let activePage: Page | null = null;
let tidyBusy = false;
let listScrollTop = 0;
let graphTeardown: (() => void) | null = null;
let graphMode: GraphMode = "constellation";
let graphSearch = "";
let orbitSpeed = 0.5;
let coachThesis = "";
let coachDraft = "";
let coachInput = "";
let coachBusy = false;
let coachError = "";
let coachTurns: CoachTurn[] = [];

type ComposeState = {
  id: string;
  title: string;
  area: "notes" | "university";
  tags: string;
  body: string;
  existing: Attachment[];
  pending: File[];
  titleError: string;
  busy: boolean;
  captureBusy: boolean;
  recording: boolean;
};

let compose: ComposeState | null = null;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function blankCompose(): ComposeState {
  return {
    id: newHubPageId(),
    title: "",
    area: "notes",
    tags: "",
    body: "",
    existing: [],
    pending: [],
    titleError: "",
    busy: false,
    captureBusy: false,
    recording: false,
  };
}

function composeFromPage(page: Page): ComposeState {
  return {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags.join(", "),
    body: page.body,
    existing: [...page.attachments],
    pending: [],
    titleError: "",
    busy: false,
    captureBusy: false,
    recording: false,
  };
}

const icons = {
  archive: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4z"/><path d="M9 7V5h6v2"/><path d="M8 12h8"/></svg>`,
  graph: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="18" cy="14" r="2.2"/><path d="M8 11l3-3M13.5 8l3 4"/></svg>`,
  coach: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h10v14H5z"/><path d="M8 9h4M8 13h4"/><path d="M17 8l4 4-6 6h-4v-4z"/></svg>`,
  podcast: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10" r="3"/><path d="M8 10a4 4 0 0 0 8 0"/><path d="M6 10a6 6 0 0 0 12 0"/><path d="M12 13v6M9 19h6"/></svg>`,
  quiz: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v16H8z"/><path d="M11 8h2M11 12h2M11 16h1"/></svg>`,
  wiki: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v12H5z"/><path d="M8 10h8M8 14h5"/></svg>`,
};

function kindBadge(attachment: Attachment) {
  if (attachment.kind === "pdf") return "PDF";
  if (attachment.kind === "audio") return "AUDIO";
  if (attachment.kind === "image") {
    const extension = attachment.filename.split(".").pop()?.toUpperCase();
    return extension && extension.length <= 4 ? extension : "IMG";
  }
  const extension = attachment.filename.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 4 ? extension : "FILE";
}

function cardMeta(item: PageManifestEntry) {
  return topicKeywords(item.tags)[0] ?? "";
}

function pageHeader(eyebrow: string, title: string, actionsInner = "") {
  const utilities = hubUtilitiesHtml();
  const actions =
    actionsInner || utilities
      ? `<div class="page-header__actions">${actionsInner}${utilities}</div>`
      : "";
  return `<header class="topbar page-header">
      <div class="page-header__copy">
        <p class="eyebrow page-header__eyebrow">${eyebrow}</p>
        <h1 class="page-header__title">${title}</h1>
      </div>
      ${actions}
    </header>`;
}

function listTitle() {
  return keywordFilter || "Archive";
}

function renderAttachments(page: Page) {
  if (!page.attachments.length) return "";
  return `<section class="attachments" aria-label="Attachments">
    <h3>Attachments</h3>
    <p class="attachments__hint">${
      USE_LOCAL_DATA
        ? "Linked files for this note. Downloads need the live API; UI preview is local-only."
        : "Linked from this note. Downloads use a short-lived signed URL from private storage."
    }</p>
    <div class="file-list">
      ${page.attachments
        .map(
          attachment => `<button class="file" type="button" data-attachment="${escapeHtml(attachment.id)}">
            <span class="file-icon ${attachment.kind}">${kindBadge(attachment)}</span>
            <span>
              <span class="file-name">${escapeHtml(attachment.filename)}</span>
              ${attachment.label ? `<span class="file-gloss">${escapeHtml(attachment.label)}</span>` : ""}
            </span>
            <span class="file-action">Download →</span>
          </button>`,
        )
        .join("")}
    </div>
  </section>`;
}

function leaveSpecialRails() {
  if (view === "podcast") leavePodcastRail();
  if (view === "quiz") leaveQuizRail();
  if (view === "wiki") leaveWikiRail();
}

function clearPageHash() {
  if (isPageHash(location.hash)) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
}

function goToHome() {
  leaveSpecialRails();
  const next = goHome({ view, query, keywordFilter, activePage, compose });
  view = next.view;
  query = next.query;
  keywordFilter = next.keywordFilter;
  activePage = next.activePage;
  compose = next.compose;
  clearPageHash();
  listScrollTop = 0;
  void refreshVisible().then(render);
}

function shell(main: string) {
  if (graphTeardown) {
    graphTeardown();
    graphTeardown = null;
  }
  app.innerHTML = `<div class="app-shell">
    <aside class="rail" aria-label="Knowledge Hub">
      <button type="button" class="rail__brand" data-home aria-label="Knowledge Hub home">Knowledge Hub</button>
      <nav class="rail__nav">
        <button class="rail__btn ${view === "list" && !keywordFilter ? "is-active" : ""}" data-nav="all" type="button">${icons.archive}<span>Archive</span></button>
        <button class="rail__btn ${view === "graph" ? "is-active" : ""}" data-nav="graph" type="button">${icons.graph}<span>Graph</span></button>
        <button class="rail__btn ${view === "coach" ? "is-active" : ""}" data-nav="coach" type="button">${icons.coach}<span>Coach</span></button>
        <button class="rail__btn ${view === "podcast" ? "is-active" : ""}" data-nav="podcast" type="button">${icons.podcast}<span>Podcast</span></button>
        <button class="rail__btn ${view === "quiz" ? "is-active" : ""}" data-nav="quiz" type="button">${icons.quiz}<span>Quiz</span></button>
        <button class="rail__btn ${view === "wiki" ? "is-active" : ""}" data-nav="wiki" type="button">${icons.wiki}<span>Wiki</span></button>
      </nav>
    </aside>
    <main class="canvas">${main}</main>
  </div>`;

  app.querySelector<HTMLButtonElement>("[data-home]")!.onclick = () => goToHome();

  app.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.nav!;
      const special: Record<string, View> = {
        graph: "graph",
        coach: "coach",
        podcast: "podcast",
        quiz: "quiz",
        wiki: "wiki",
      };
      if (special[next]) {
        leaveSpecialRails();
        view = special[next];
        activePage = null;
        clearPageHash();
        if (next === "podcast") enterPodcastRail();
        if (next === "quiz") enterQuizRail();
        if (next === "wiki") enterWikiRail();
        render();
        return;
      }
      leaveSpecialRails();
      keywordFilter = "";
      view = "list";
      activePage = null;
      clearPageHash();
      listScrollTop = 0;
      void refreshVisible().then(render);
    };
  });

  app.querySelector<HTMLButtonElement>("[data-logout]")?.addEventListener("click", async () => {
    await logout();
    entries = [];
    visible = [];
    activePage = null;
    renderLogin();
  });
}

async function refreshVisible() {
  const source = query ? await searchPages(query) : entries;
  visible = source.filter(item => {
    if (keywordFilter && !topicKeywords(item.tags).includes(keywordFilter)) return false;
    return true;
  });
}

function rowHtml(item: PageManifestEntry) {
  const meta = cardMeta(item);
  return `<button class="card" type="button" data-id="${escapeHtml(item.id)}" style="height:${ROW_HEIGHT}px">
    <p class="card__meta">${meta ? escapeHtml(meta) : "—"}</p>
    <div>
      <h2 class="card__title">${escapeHtml(item.title)}</h2>
      <p class="card__excerpt">${escapeHtml(item.excerpt)}</p>
    </div>
  </button>`;
}

function bindListRows(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>("[data-id]").forEach(button => {
    button.onclick = () => void openPage(button.dataset.id!);
  });
}

function renderVirtualList(viewport: HTMLElement) {
  const total = visible.length;
  const viewportHeight = viewport.clientHeight || 560;
  const start = Math.max(0, Math.floor(listScrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(total, Math.ceil((listScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const offset = start * ROW_HEIGHT;
  const windowItems = visible.slice(start, end);

  viewport.innerHTML = `<div class="list-spacer" style="height:${Math.max(total * ROW_HEIGHT, total ? 0 : 120)}px">
    <div class="list-window" style="transform:translateY(${offset}px)">
      ${
        windowItems.map(rowHtml).join("") ||
        archiveEmptyHtml({
          hasArchiveNotes: entries.length > 0,
        })
      }
    </div>
  </div>`;
  bindListRows(viewport);
}

function renderList() {
  shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · reading migrated data · no Netlify deploy</p>` : ""}
    ${pageHeader(
      `Private archive${keywordFilter ? " · keyword" : ""}`,
      escapeHtml(listTitle()),
      `<button class="btn" data-new-note type="button">New note</button>
        <div class="viewbar">
          <button class="viewbar__btn is-active" type="button">List</button>
          <button class="viewbar__btn" data-jump-graph type="button">Graph</button>
        </div>`,
    )}
    <div class="toolbar">
      <input class="search" value="${escapeHtml(query)}" placeholder="Search titles, tags, excerpts…" aria-label="Search archive" />
      ${
        keywordFilter
          ? `<div class="filters">
        <button class="filter-chip is-active" data-clear-keyword type="button">Clear “${escapeHtml(keywordFilter)}”</button>
      </div>`
          : ""
      }
    </div>
    <p class="list-count">${visible.length.toLocaleString()} notes</p>
    <div class="cards list-viewport" aria-label="Archive list"></div>
  `);

  app.querySelector<HTMLButtonElement>("[data-jump-graph]")!.onclick = () => {
    view = "graph";
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-new-note]")!.onclick = () => {
    compose = blankCompose();
    view = "compose";
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-clear-keyword]")?.addEventListener("click", () => {
    keywordFilter = "";
    listScrollTop = 0;
    void refreshVisible().then(render);
  });

  const input = app.querySelector<HTMLInputElement>(".search")!;
  input.oninput = async event => {
    query = (event.target as HTMLInputElement).value;
    listScrollTop = 0;
    await refreshVisible();
    render();
    const next = app.querySelector<HTMLInputElement>(".search")!;
    next.value = query;
    next.focus();
    next.setSelectionRange(query.length, query.length);
  };

  const viewport = app.querySelector<HTMLElement>(".list-viewport")!;
  viewport.scrollTop = listScrollTop;
  renderVirtualList(viewport);
  viewport.onscroll = () => {
    listScrollTop = viewport.scrollTop;
    renderVirtualList(viewport);
  };
}

function orbitSpeedLabel(speed: number) {
  return speed === 0 ? "Paused" : `${speed.toFixed(2)}×`;
}

function renderGraph() {
  const constellation = buildArchiveGraph(entries);
  const excerptFor = (pageId: string) => entries.find(entry => entry.id === pageId)?.excerpt ?? "";

  const meta =
    constellation.majorCount === 0
      ? "No topic keywords yet · Universe still has a sun"
      : graphMode === "constellation"
        ? `${constellation.majorCount} majors · ${constellation.minorCount} sub-themes · click a hub to open its constellation`
        : graphMode === "showAll"
          ? "Every note · hubs as landmarks · lines where notes share tags"
          : "Universe View · a fake sun · planets and moons";

  const searching = graphSearch.trim();
  let searchHint = searching ? ` · search “${escapeHtml(searching)}”` : "";
  if (searching) {
    const hits =
      graphMode === "universe"
        ? universeHotIds(buildUniverseGraph(entries).bodies, graphSearch).size
        : searchCluster(
            (graphMode === "showAll" ? buildShowAllGraph(entries, constellation) : constellation).nodes,
            graphSearch,
          ).size;
    if (!hits) searchHint += " · no matches";
  }

  shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · graph stays on this canvas</p>` : ""}
    ${pageHeader(
      "Private archive",
      "Keyword graph",
      `<div class="viewbar">
        <button class="viewbar__btn" data-jump-list type="button">List</button>
        <button class="viewbar__btn is-active" type="button">Graph</button>
      </div>`,
    )}
    <div class="graph-wrap">
      <div class="graph-toolbar glass-panel">
        <div class="graph-modes">
          <button type="button" data-graph-mode="constellation" class="${graphMode === "constellation" ? "is-active" : ""}">Constellation</button>
          <button type="button" data-graph-mode="showAll" class="${graphMode === "showAll" ? "is-active" : ""}">Show All</button>
          <button type="button" data-graph-mode="universe" class="${graphMode === "universe" ? "is-active" : ""}">Universe</button>
        </div>
        <input class="graph-search" type="search" placeholder="Search keywords and notes" value="${escapeHtml(graphSearch)}" />
        ${
          graphMode === "universe"
            ? `<label class="graph-speed">
                <span class="graph-speed__label">Orbit speed</span>
                <input type="range" min="0" max="1" step="0.05" value="${orbitSpeed}" data-orbit-speed />
                <output class="graph-speed__value" data-orbit-speed-value>${orbitSpeedLabel(orbitSpeed)}</output>
              </label>`
            : ""
        }
        <p class="graph-toolbar__meta">${meta}${searchHint}</p>
      </div>
      <div class="graph-stage"></div>
    </div>
  `);

  app.querySelector<HTMLButtonElement>("[data-jump-list]")!.onclick = () => {
    view = "list";
    render();
  };

  app.querySelectorAll<HTMLButtonElement>("[data-graph-mode]").forEach(button => {
    button.onclick = () => {
      graphMode = button.dataset.graphMode as GraphMode;
      render();
    };
  });

  const search = app.querySelector<HTMLInputElement>(".graph-search")!;
  search.oninput = () => {
    graphSearch = search.value;
    render();
    const next = app.querySelector<HTMLInputElement>(".graph-search")!;
    next.focus();
    next.setSelectionRange(graphSearch.length, graphSearch.length);
  };

  const stage = app.querySelector<HTMLElement>(".graph-stage")!;
  const preview = mountGraphPreview(stage, { onOpen: pageId => void openPage(pageId) });
  const onNoteSelect = (note: { pageId: string; title: string; excerpt: string } | null) => {
    if (!note) {
      preview.clear();
      return;
    }
    preview.show({ ...note, excerpt: note.excerpt || excerptFor(note.pageId) });
  };

  document.onkeydown = event => {
    if (event.key !== "Enter") return;
    const open = stage.querySelector<HTMLButtonElement>("[data-open-note]");
    if (open && !preview.el.hidden) open.click();
  };

  let stop = () => {};
  if (graphMode === "universe") {
    const clock = { speed: orbitSpeed };
    const slider = app.querySelector<HTMLInputElement>("[data-orbit-speed]");
    const readout = app.querySelector<HTMLOutputElement>("[data-orbit-speed-value]");
    if (slider) {
      slider.oninput = () => {
        orbitSpeed = Number(slider.value);
        clock.speed = orbitSpeed;
        if (readout) readout.textContent = orbitSpeedLabel(orbitSpeed);
      };
    }
    stop = mountUniverseView(stage, buildUniverseGraph(entries), {
      search: graphSearch,
      onNoteSelect,
      clock,
    });
  } else {
    const model = graphMode === "showAll" ? buildShowAllGraph(entries, constellation) : constellation;
    stop = mountForceGraph(
      stage,
      model,
      { onNoteSelect },
      { variant: graphMode, search: graphSearch, excerptFor },
    );
  }
  graphTeardown = () => {
    document.onkeydown = null;
    stop();
  };
}

async function openPage(id: string) {
  try {
    activePage = await getPage(id);
  } catch {
    showToast("That note isn't in the archive.");
    return;
  }
  view = "page";
  const next = pageHashForId(id);
  if (location.hash !== next) location.hash = next;
  render();
}

async function applyPageHash(): Promise<boolean> {
  const id = pageIdFromHash(location.hash);
  if (!id) return false;
  try {
    activePage = await getPage(id);
    view = "page";
    render();
    return true;
  } catch {
    showToast("That note isn't in the archive.");
    view = "list";
    render();
    return false;
  }
}

function findingCards(findings: ResearchFinding[]): string {
  return findings
    .map(
      item => `<article class="alchemist-card glass-panel">
        <p class="alchemist-card__icon">${escapeHtml(item.stance)}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="alchemist-card__why">${escapeHtml(item.analysis)}</p>
        <p class="alchemist-card__excerpt">${escapeHtml(item.excerpt)}</p>
        <button type="button" data-open-page="${escapeHtml(item.pageId)}">Open “${escapeHtml(item.title)}” →</button>
      </article>`,
    )
    .join("");
}

function renderCoach() {
  shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · coach needs the Netlify API (session + Anthropic). The browser never talks to the research kernel.</p>` : ""}
    ${pageHeader("Professor Clementine Haig", "University office")}
    <section class="coach">
      <form class="coach__form glass-panel">
        <label for="coach-thesis">Working thesis</label>
        <input id="coach-thesis" value="${escapeHtml(coachThesis)}" placeholder="The claim, in one sentence" />
        <label for="coach-draft">Draft</label>
        <textarea id="coach-draft" rows="8" placeholder="Paste a section…">${escapeHtml(coachDraft)}</textarea>
        <label for="coach-input">Message</label>
        <textarea id="coach-input" rows="4" placeholder="Ask her about the argument…">${escapeHtml(coachInput)}</textarea>
        <div class="alchemist__actions">
          <button type="submit" ${coachBusy ? "disabled" : ""}>${coachBusy ? "Reading…" : "Send"}</button>
          ${coachThesis ? `<p class="alchemist__mode">Thesis in play</p>` : `<p class="alchemist__mode">Optional thesis — she will still start with the argument</p>`}
        </div>
        ${coachError ? `<p class="alchemist__error">${escapeHtml(coachError)}</p>` : ""}
      </form>
      <div class="coach__thread" aria-live="polite">
        ${
          coachTurns.length
            ? coachTurns
                .map(
                  turn => `<article class="coach-msg coach-msg--${turn.role} glass-panel">
                    <p class="coach-msg__who">${turn.role === "user" ? "You" : "Clementine"}</p>
                    <p class="coach-msg__body">${escapeHtml(turn.content)}</p>
                    ${
                      turn.archiveFailed
                        ? `<p class="alchemist__error">Archive pull failed this turn — she continued with what she had.</p>`
                        : ""
                    }
                    ${turn.findings?.length ? `<div class="coach-msg__citations">${findingCards(turn.findings)}</div>` : ""}
                  </article>`,
                )
                .join("")
            : `<p class="empty">She is waiting. Put a claim or a messy paragraph on the table.</p>`
        }
      </div>
    </section>
  `);

  const form = app.querySelector("form")!;
  const thesis = app.querySelector<HTMLInputElement>("#coach-thesis")!;
  const draft = app.querySelector<HTMLTextAreaElement>("#coach-draft")!;
  const input = app.querySelector<HTMLTextAreaElement>("#coach-input")!;

  thesis.oninput = () => {
    coachThesis = thesis.value;
  };
  draft.oninput = () => {
    coachDraft = draft.value;
  };
  input.oninput = () => {
    coachInput = input.value;
  };

  form.onsubmit = async event => {
    event.preventDefault();
    coachThesis = thesis.value.trim();
    coachDraft = draft.value;
    coachInput = input.value.trim();
    if (!coachInput) return;
    const history: CoachTurn[] = [...coachTurns, { role: "user", content: coachInput }];
    coachTurns = history;
    const outgoing = coachInput;
    coachInput = "";
    coachBusy = true;
    coachError = "";
    render();
    try {
      const result = await runCoach({
        messages: history.map(({ role, content }) => ({ role, content })),
        workingThesis: coachThesis || undefined,
        draft: coachDraft || undefined,
      });
      coachTurns = [
        ...history,
        {
          role: "assistant",
          content: result.reply,
          findings: result.research?.findings,
          archiveFailed: result.archiveFailed,
        },
      ];
    } catch (error) {
      coachInput = outgoing;
      coachError = error instanceof Error ? error.message : "Coach failed";
    } finally {
      coachBusy = false;
      render();
    }
  };

  app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => void openPage(button.dataset.openPage!);
  });
}

function renderPage(page: Page) {
  const topics = topicKeywords(page.tags);
  const chips = topics
    .slice(0, 6)
    .map(tag => `<span class="chip">${escapeHtml(tag)}</span>`)
    .join("");

  shell(`
    <article class="reader">
      <div class="reader__actions">
        <button class="reader__back" data-back type="button">← Archive</button>
        <button class="btn" data-edit type="button">Edit</button>
        <button class="btn btn--ghost reader__tidy" data-tidy type="button" ${tidyBusy ? "disabled" : ""}>${tidyBusy ? "Cleaning up…" : "Clean up"}</button>
        ${hubUtilitiesHtml()}
      </div>
      <p class="eyebrow">${topics[0] ? escapeHtml(topics[0]) : "Note"}</p>
      <h1 class="reader__title">${escapeHtml(page.title)}</h1>
      <div class="reader__meta">${chips}</div>
      <div class="reader__body">${renderMarkdown(page.body)}</div>
      ${connectedLinksHtml(page, entries)}
      ${renderAttachments(page)}
    </article>
  `);

  app.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => {
    activePage = null;
    view = "list";
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-edit]")!.onclick = () => {
    compose = composeFromPage(page);
    view = "compose";
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-tidy]")!.onclick = async () => {
    if (tidyBusy) return;
    tidyBusy = true;
    render();
    try {
      activePage = await tidyPage(page.id);
      entries = await listPages();
      await refreshVisible();
      showToast("Cleaned up");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Clean up failed");
    } finally {
      tidyBusy = false;
      render();
    }
  };
  app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => void openPage(button.dataset.openPage!);
  });
  app.querySelectorAll<HTMLButtonElement>("[data-attachment]").forEach(button => {
    button.onclick = async () => {
      try {
        const { url } = await getAttachmentUrl(page.id, button.dataset.attachment!);
        window.location.assign(url);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Download unavailable");
      }
    };
  });
}

function renderCompose(state: ComposeState) {
  const files = [
    ...state.existing.map(
      (item, index) =>
        `<li><span>${escapeHtml(item.filename)}</span><button type="button" data-remove-existing="${index}">Remove</button></li>`,
    ),
    ...state.pending.map(
      (file, index) =>
        `<li><span>${escapeHtml(file.name)} (new)</span><button type="button" data-remove-pending="${index}">Remove</button></li>`,
    ),
  ].join("");
  const captureBusy = state.captureBusy || state.recording;

  const composeLabel = state.id.startsWith("page_hub_") && !activePage ? "New note" : "Edit note";
  shell(`
    <section class="compose">
      ${pageHeader(
        composeLabel,
        composeLabel,
        `<button class="reader__back" data-compose-cancel type="button">← Cancel</button>`,
      )}
      ${USE_LOCAL_DATA ? `<p class="local-banner">Saving and capture need the live API (npx netlify dev).</p>` : ""}
      <div class="compose__field">
        <label for="compose-title">Title</label>
        <input id="compose-title" value="${escapeHtml(state.title)}" />
        ${state.titleError ? `<p class="compose__error">${escapeHtml(state.titleError)}</p>` : ""}
      </div>
      <div class="compose__field">
        <label for="compose-tags">Tags</label>
        <input id="compose-tags" value="${escapeHtml(state.tags)}" placeholder="Comma-separated" />
      </div>
      <div class="compose__field">
        <label for="compose-body">Body (markdown)</label>
        <textarea id="compose-body">${escapeHtml(state.body)}</textarea>
      </div>
      ${captureFieldHtml({
        busy: state.busy,
        captureBusy: state.captureBusy,
        recording: state.recording,
        localData: USE_LOCAL_DATA,
      })}
      <div class="compose__field">
        <label>Attachments</label>
        <ul class="compose__files">${files || "<li>None</li>"}</ul>
        <input id="compose-files" type="file" multiple />
      </div>
      <button class="btn btn--primary compose__save" data-compose-save type="button" ${
        USE_LOCAL_DATA || state.busy || captureBusy ? "disabled" : ""
      }>${state.busy ? "Saving…" : "Save"}</button>
    </section>
  `);

  const syncFields = () => {
    if (!compose) return;
    compose.title = app.querySelector<HTMLInputElement>("#compose-title")!.value;
    compose.tags = app.querySelector<HTMLInputElement>("#compose-tags")!.value;
    compose.body = app.querySelector<HTMLTextAreaElement>("#compose-body")!.value;
  };

  const voice = createVoiceCapture({
    onFile: file => void ingestAndApply(file, "voice"),
  });

  async function ingestAndApply(file: File, kind: "voice" | "photo" | "pdf") {
    if (!compose) return;
    compose.captureBusy = true;
    render();
    const result = await ingestCaptureFile(
      { file, kind, pageId: compose.id, area: compose.area, body: compose.body, title: compose.title },
      { signAttachment, uploadSignedFile, runCapture, localData: USE_LOCAL_DATA },
    );
    if (result.attachment) compose.existing.push(result.attachment as Attachment);
    if (result.ok) {
      compose.body = result.body;
      compose.title = result.title;
    }
    showToast(result.toast);
    compose.captureBusy = false;
    compose.recording = false;
    render();
  }

  app.querySelector<HTMLButtonElement>("[data-compose-cancel]")!.onclick = () => {
    compose = null;
    view = activePage ? "page" : "list";
    render();
  };
  app.querySelectorAll<HTMLButtonElement>("[data-remove-existing]").forEach(button => {
    button.onclick = () => {
      if (!compose) return;
      syncFields();
      compose.existing.splice(Number(button.dataset.removeExisting), 1);
      render();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-remove-pending]").forEach(button => {
    button.onclick = () => {
      if (!compose) return;
      syncFields();
      compose.pending.splice(Number(button.dataset.removePending), 1);
      render();
    };
  });
  app.querySelector<HTMLInputElement>("#compose-files")!.onchange = event => {
    if (!compose) return;
    syncFields();
    const list = Array.from((event.target as HTMLInputElement).files ?? []);
    compose.pending.push(...list);
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-compose-save]")!.onclick = () => void saveCompose();
  bindCaptureControls(app, {
    syncFields,
    onVoice: () => {
      void voice.toggle().then(status => {
        if (!compose) return;
        if (status === "denied") showToast("Microphone permission is required for voice capture");
        if (status === "started") {
          compose.recording = true;
          render();
        }
      });
    },
    onPhoto: file => void ingestAndApply(file, "photo"),
    onPdf: file => void ingestAndApply(file, "pdf"),
  });
}

async function saveCompose() {
  if (!compose || compose.busy) return;
  compose.title = app.querySelector<HTMLInputElement>("#compose-title")!.value;
  compose.tags = app.querySelector<HTMLInputElement>("#compose-tags")!.value;
  compose.body = app.querySelector<HTMLTextAreaElement>("#compose-body")!.value;
  if (!compose.title.trim()) {
    compose.titleError = "Title is required";
    render();
    return;
  }
  compose.titleError = "";
  compose.busy = true;
  render();
  const snapshot = compose;
  try {
    const uploaded: Attachment[] = [];
    for (const file of snapshot.pending) {
      if (file.size > MAX_FILE_BYTES) {
        showToast(`${file.name} exceeds 20MB and was skipped`);
        continue;
      }
      const signed = await signAttachment({
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        byte_size: file.size,
        page_id: snapshot.id,
        area: snapshot.area,
      });
      await uploadSignedFile(signed.put_url, file, file.type || "application/octet-stream");
      uploaded.push(signed.attachment);
    }
    const now = new Date().toISOString();
    const hub = snapshot.id.startsWith("page_hub_");
    const page: Page = {
      id: snapshot.id,
      title: snapshot.title.trim(),
      area: snapshot.area,
      tags: parseTagList(snapshot.tags),
      body: snapshot.body,
      connected: activePage?.connected ?? [],
      attachments: [...snapshot.existing, ...uploaded],
      source: hub ? "hub" : activePage?.source,
      source_notion_id: hub ? undefined : activePage?.source_notion_id,
      source_notion_url: hub ? undefined : activePage?.source_notion_url,
      created_at: activePage?.created_at ?? now,
      updated_at: now,
      schema_version: 1,
    };
    const saved = await savePage(page);
    entries = await listPages();
    activePage = saved;
    compose = null;
    view = "page";
    showToast("Saved");
    await refreshVisible();
    render();
  } catch (error) {
    snapshot.busy = false;
    compose = snapshot;
    showToast(error instanceof Error ? error.message : "Save failed");
    render();
  }
}

function render() {
  if (view === "compose" && compose) return renderCompose(compose);
  if (view === "page" && activePage) return renderPage(activePage);
  if (view === "graph") return renderGraph();
  if (view === "coach") return renderCoach();
  if (view === "podcast") {
    return renderPodcastRail({
      app,
      tags: [...new Set(entries.flatMap(entry => topicKeywords(entry.tags)))].sort(),
      shell,
      render,
      onOpenPage: pageId => void openPage(pageId),
    });
  }
  if (view === "quiz") {
    return renderQuizRail({
      app,
      entries,
      tags: [...new Set(entries.flatMap(entry => entry.tags))].sort(),
      shell,
      render,
      onOpenPage: id => void openPage(id),
    });
  }
  if (view === "wiki") {
    return renderWikiRail({
      app,
      shell,
      render,
      onOpenPage: pageId => void openPage(pageId),
    });
  }
  return renderList();
}

function renderLogin() {
  app.innerHTML = `<div class="sign-in">
    <form class="sign-in__card" method="post" action="#">
      <p class="sign-in__brand">Knowledge Hub</p>
      <h1 class="sign-in__title">Sign in</h1>
      <p class="sign-in__supporting">The archive stays private.</p>
      <div class="sign-in__field">
        <label class="sign-in__label" for="sign-in-passphrase">Passphrase</label>
        <input class="sign-in__input" id="sign-in-passphrase" name="passphrase" type="password" required autocomplete="current-password" />
      </div>
      <p class="sign-in__error" role="alert" hidden></p>
      <button class="btn btn--primary sign-in__submit" type="submit">Sign in</button>
    </form>
  </div>`;
  app.querySelector("form")!.onsubmit = async event => {
    event.preventDefault();
    const error = app.querySelector<HTMLParagraphElement>(".sign-in__error")!;
    error.hidden = true;
    const passphrase = app.querySelector<HTMLInputElement>("#sign-in-passphrase")!.value;
    try {
      const ok = await login(passphrase);
      if (!ok) {
        error.hidden = false;
        error.textContent = "Invalid passphrase";
        return;
      }
      await boot();
    } catch {
      error.hidden = false;
      error.textContent = "Unable to sign in. Please try again.";
    }
  };
}

async function boot() {
  try {
    entries = await listPages();
    await refreshVisible();
    view = "list";
    if (!(await applyPageHash())) render();
    if (!(window as Window & { __khPageHashBound?: boolean }).__khPageHashBound) {
      (window as Window & { __khPageHashBound?: boolean }).__khPageHashBound = true;
      window.addEventListener("hashchange", () => {
        void (async () => {
          const opened = await applyPageHash();
          if (!opened && view === "page") {
            view = "list";
            activePage = null;
            render();
          }
        })();
      });
    }
  } catch {
    if (USE_LOCAL_DATA) {
      app.innerHTML = `<div class="sign-in"><div class="sign-in__card"><h1 class="sign-in__title">Local data missing</h1><p class="sign-in__supporting">Run the migrator first, then restart <code>npm run dev</code>.</p></div></div>`;
      return;
    }
    renderLogin();
  }
}

boot();
