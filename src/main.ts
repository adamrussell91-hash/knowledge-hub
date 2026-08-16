import "./tokens.css";
import "./style.css";
import type { Attachment, Page, PageManifestEntry } from "./domain/page";
import {
  USE_LOCAL_DATA,
  getAttachmentUrl,
  getPage,
  listPages,
  login,
  logout,
  runAlchemist,
  runCoach,
  searchPages,
  type AlchemistConnection,
  type CoachMessage,
} from "./api/client";
import type { ResearchFinding } from "./research/schema";
import { escapeHtml, showToast } from "./lib/dom";
import { renderMarkdown } from "./lib/markdown";
import { archiveEmptyHtml } from "./archive/emptyList";
import { searchCluster } from "./archive/graphFocus";
import { mountGraphPreview } from "./archive/graphPreview";
import { buildArchiveGraph, topicKeywords } from "./archive/keywordGraph";
import { mountForceGraph } from "./archive/forceGraph";
import { buildShowAllGraph } from "./archive/showAllGraph";
import { buildUniverseGraph } from "./archive/universeGraph";
import { mountUniverseView, universeHotIds } from "./archive/universeView";

type AreaFilter = "all" | "university" | "notes";
type View = "list" | "graph" | "page" | "alchemist" | "coach";
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
let area: AreaFilter = "all";
let view: View = "list";
let query = "";
let keywordFilter = "";
let activePage: Page | null = null;
let listScrollTop = 0;
let graphTeardown: (() => void) | null = null;
let graphMode: GraphMode = "constellation";
let graphSearch = "";
let alchemistLesson = "";
let alchemistBusy = false;
let alchemistError = "";
let alchemistConnections: AlchemistConnection[] = [];
let alchemistMode = "";
let coachThesis = "";
let coachDraft = "";
let coachInput = "";
let coachBusy = false;
let coachError = "";
let coachTurns: CoachTurn[] = [];

const icons = {
  archive: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4z"/><path d="M9 7V5h6v2"/><path d="M8 12h8"/></svg>`,
  graph: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="18" cy="14" r="2.2"/><path d="M8 11l3-3M13.5 8l3 4"/></svg>`,
  university: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12.5V17c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16H7z"/><path d="M10 8h4M10 12h4M10 16h3"/></svg>`,
  alchemist: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 4H9L8 3z"/><path d="M9 7l-3 12h12l-3-12"/><path d="M10 12h4"/></svg>`,
  coach: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h10v14H5z"/><path d="M8 9h4M8 13h4"/><path d="M17 8l4 4-6 6h-4v-4z"/></svg>`,
};

function kindBadge(attachment: Attachment) {
  if (attachment.kind === "pdf") return "PDF";
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

function pageHeader(eyebrow: string, title: string, actions = "") {
  return `<header class="topbar page-header">
      <div class="page-header__copy">
        <p class="eyebrow page-header__eyebrow">${eyebrow}</p>
        <h1 class="page-header__title">${title}</h1>
      </div>
      ${actions}
    </header>`;
}

function titleForArea() {
  if (keywordFilter) return keywordFilter;
  if (area === "university") return "University";
  if (area === "notes") return "Notes";
  return "Archive";
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

function shell(main: string) {
  if (graphTeardown) {
    graphTeardown();
    graphTeardown = null;
  }
  app.innerHTML = `<div class="app-shell">
    <aside class="rail" aria-label="Knowledge Hub">
      <p class="rail__brand">Knowledge<br>Hub</p>
      <nav class="rail__nav">
        <button class="rail__btn ${view === "list" && area === "all" && !keywordFilter ? "is-active" : ""}" data-nav="all" type="button">${icons.archive}<span>Archive</span></button>
        <button class="rail__btn ${area === "university" && view === "list" ? "is-active" : ""}" data-nav="university" type="button">${icons.university}<span>Uni</span></button>
        <button class="rail__btn ${area === "notes" && view === "list" ? "is-active" : ""}" data-nav="notes" type="button">${icons.notes}<span>Notes</span></button>
        <button class="rail__btn ${view === "graph" ? "is-active" : ""}" data-nav="graph" type="button">${icons.graph}<span>Graph</span></button>
        <button class="rail__btn ${view === "alchemist" ? "is-active" : ""}" data-nav="alchemist" type="button">${icons.alchemist}<span>Alchemist</span></button>
        <button class="rail__btn ${view === "coach" ? "is-active" : ""}" data-nav="coach" type="button">${icons.coach}<span>Coach</span></button>
      </nav>
      ${
        USE_LOCAL_DATA
          ? ""
          : `<button class="rail__logout" data-logout type="button">Sign out</button>`
      }
    </aside>
    <main class="canvas">${main}</main>
  </div>`;

  app.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.nav!;
      if (next === "graph") {
        view = "graph";
        activePage = null;
        render();
        return;
      }
      if (next === "alchemist") {
        view = "alchemist";
        activePage = null;
        render();
        return;
      }
      if (next === "coach") {
        view = "coach";
        activePage = null;
        render();
        return;
      }
      area = next as AreaFilter;
      keywordFilter = "";
      view = "list";
      activePage = null;
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
    if (area !== "all" && item.area !== area) return false;
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
          area,
          notesInArchive: entries.some(item => item.area === "notes"),
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
      escapeHtml(titleForArea()),
      `<div class="viewbar page-header__actions">
        <button class="viewbar__btn is-active" type="button">List</button>
        <button class="viewbar__btn" data-jump-graph type="button">Graph</button>
      </div>`,
    )}
    <div class="toolbar">
      <input class="search" value="${escapeHtml(query)}" placeholder="Search titles, tags, excerpts…" aria-label="Search archive" />
      <div class="filters">
        <button class="filter-chip ${area === "all" && !keywordFilter ? "is-active" : ""}" data-filter="all" type="button">All</button>
        <button class="filter-chip ${area === "university" ? "is-active" : ""}" data-filter="university" type="button">University</button>
        <button class="filter-chip ${area === "notes" ? "is-active" : ""}" data-filter="notes" type="button">Notes</button>
        ${
          keywordFilter
            ? `<button class="filter-chip is-active" data-clear-keyword type="button">Clear “${escapeHtml(keywordFilter)}”</button>`
            : ""
        }
      </div>
    </div>
    <p class="list-count">${visible.length.toLocaleString()} notes</p>
    <div class="cards list-viewport" aria-label="Archive list"></div>
  `);

  app.querySelector<HTMLButtonElement>("[data-jump-graph]")!.onclick = () => {
    view = "graph";
    render();
  };
  app.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(button => {
    button.onclick = () => {
      area = button.dataset.filter as AreaFilter;
      keywordFilter = "";
      listScrollTop = 0;
      void refreshVisible().then(render);
    };
  });
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
      `<div class="viewbar page-header__actions">
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
    stop = mountUniverseView(stage, buildUniverseGraph(entries), {
      search: graphSearch,
      onNoteSelect,
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
  activePage = await getPage(id);
  view = "page";
  render();
}

function renderAlchemist() {
  const modeLabel =
    alchemistMode === "local"
      ? "Local lexical retrieval"
      : alchemistMode === "synthesis"
        ? "Claude synthesis"
        : alchemistMode === "retrieval"
          ? "Retrieval only (no Anthropic key)"
          : alchemistMode === "empty"
            ? "No candidates"
            : "Paste a lesson to find non-obvious archive links";

  shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · lexical retrieval over your archive · full Claude synthesis needs the live Alchemist API</p>` : ""}
    ${pageHeader("Lesson Alchemist", "Cross-domain connections")}
    <section class="alchemist">
      <form class="alchemist__form glass-panel">
        <label for="lesson-input">Lesson text</label>
        <textarea id="lesson-input" rows="8" placeholder="Paste a lesson outline, learning intention, or topic…">${escapeHtml(alchemistLesson)}</textarea>
        <div class="alchemist__actions">
          <button type="submit" ${alchemistBusy ? "disabled" : ""}>${alchemistBusy ? "Finding links…" : "Find connections"}</button>
          <p class="alchemist__mode">${escapeHtml(modeLabel)}</p>
        </div>
        ${alchemistError ? `<p class="alchemist__error">${escapeHtml(alchemistError)}</p>` : ""}
      </form>
      <div class="alchemist__results" aria-live="polite">
        ${
          alchemistConnections.length
            ? alchemistConnections
                .map(
                  item => `<article class="alchemist-card glass-panel">
                    <p class="alchemist-card__icon">${escapeHtml(item.icon)}</p>
                    <h2>${escapeHtml(item.summary)}</h2>
                    <p class="alchemist-card__why">${escapeHtml(item.whyNonObvious)}</p>
                    <p class="alchemist-card__excerpt">${escapeHtml(item.sourceExcerpt)}</p>
                    <button type="button" data-open-page="${escapeHtml(item.sourcePageId)}">Open “${escapeHtml(item.sourcePageTitle)}” →</button>
                  </article>`,
                )
                .join("")
            : `<p class="empty">Connections will appear here.</p>`
        }
      </div>
    </section>
  `);

  app.querySelector("form")!.onsubmit = async event => {
    event.preventDefault();
    const textarea = app.querySelector<HTMLTextAreaElement>("#lesson-input")!;
    alchemistLesson = textarea.value;
    alchemistBusy = true;
    alchemistError = "";
    render();
    try {
      const result = await runAlchemist(alchemistLesson);
      alchemistConnections = result.connections;
      alchemistMode = result.mode;
    } catch (error) {
      alchemistConnections = [];
      alchemistMode = "";
      alchemistError = error instanceof Error ? error.message : "Alchemist failed";
    } finally {
      alchemistBusy = false;
      render();
    }
  };

  app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => void openPage(button.dataset.openPage!);
  });
}

function findingCards(findings: ResearchFinding[]) {
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
      <button class="reader__back" data-back type="button">← Archive</button>
      <p class="eyebrow">${topics[0] ? escapeHtml(topics[0]) : "Note"}</p>
      <h1 class="reader__title">${escapeHtml(page.title)}</h1>
      <div class="reader__meta">${chips}</div>
      <div class="reader__body">${renderMarkdown(page.body)}</div>
      ${renderAttachments(page)}
    </article>
  `);

  app.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => {
    activePage = null;
    view = "list";
    render();
  };
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

function render() {
  if (view === "page" && activePage) return renderPage(activePage);
  if (view === "graph") return renderGraph();
  if (view === "alchemist") return renderAlchemist();
  if (view === "coach") return renderCoach();
  return renderList();
}

function renderLogin() {
  app.innerHTML = `<div class="sign-in">
    <form class="sign-in__card" method="post" action="#">
      <p class="sign-in__brand">Knowledge Hub</p>
      <h1 class="sign-in__title">Sign in</h1>
      <p class="sign-in__supporting">University and Notes stay private.</p>
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
    const passphrase = app.querySelector<HTMLInputElement>("#sign-in-passphrase")!.value;
    const ok = await login(passphrase);
    if (!ok) {
      const error = app.querySelector<HTMLParagraphElement>(".sign-in__error")!;
      error.hidden = false;
      error.textContent = "That passphrase didn’t work.";
      return;
    }
    await boot();
  };
}

async function boot() {
  try {
    entries = await listPages();
    await refreshVisible();
    view = "list";
    render();
  } catch {
    if (USE_LOCAL_DATA) {
      app.innerHTML = `<div class="sign-in"><div class="sign-in__card"><h1 class="sign-in__title">Local data missing</h1><p class="sign-in__supporting">Run the migrator first, then restart <code>npm run dev</code>.</p></div></div>`;
      return;
    }
    renderLogin();
  }
}

boot();
