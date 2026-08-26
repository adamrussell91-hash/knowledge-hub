import "./tokens.css";
import "./style.css";
import type { Attachment, Origin, Page, PageManifestEntry } from "./domain/page";
import { newHubPageId } from "./domain/page";
import {
  USE_LOCAL_DATA,
  getAttachmentUrl,
  getPage,
  fetchSession,
  listPages,
  login,
  logout,
  savePage,
  searchPages,
  signAttachment,
  tidyPage,
  uploadSignedFile,
} from "./api/client";
import { takeSignInQuery } from "./api/loginGate";
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
import { resolveArchivePageId } from "./chat/noteLinks";
import { cardSupportingText } from "./archive/cardText";
import { archiveEmptyHtml } from "./archive/emptyList";
import { goHome } from "./archive/goHome";
import { readerTopicPillsHtml } from "./archive/readerMeta";
import {
  emptyOriginFilter,
  originFilterHtml,
  originFilterTitle,
  originLabelsForKind,
  pageMatchesOriginFilter,
  toggleOriginKind,
  toggleOriginLabel,
} from "./archive/originFilter";
import { searchCluster } from "./archive/graphFocus";
import { mountGraphPreview } from "./archive/graphPreview";
import { buildArchiveGraph, topicKeywords, vocabularyPresent } from "./archive/keywordGraph";
import { mountForceGraph } from "./archive/forceGraph";
import {
  SHOW_ALL_TUNING_CONTROLS,
  applyShowAllTuning,
  showAllTuning,
  sliderValueForTuning,
  tuningFromSlider,
  type GraphMount,
} from "./archive/forceGraphBehavior";
import { buildShowAllGraph } from "./archive/showAllGraph";
import {
  SHOW_ALL_GROUPINGS,
  showAllGroupingLabel,
  showAllGroupingMeta,
  type ShowAllGrouping,
} from "./archive/showAllScope";
import { buildSolarModel, type SolarModel } from "./archive/solarModel";
import { UNIVERSE_BUILD, mountSolarView, resolveSearchHits } from "./archive/solarView";
import {
  applyUniverseViewState,
  bindUniverseView,
  readUniverseDark,
  shouldExitUniverseFullscreen,
  universeExitHtml,
  universeViewToolsHtml,
  universeWrapClass,
  writeUniverseDark,
} from "./archive/universeChrome";
import { bindUniverseKey, universeKeyHtml } from "./archive/universeKey";
import { enterPodcastRail, leavePodcastRail, renderPodcastRail } from "./podcast/rail";
import { enterQuizRail, leaveQuizRail, renderQuizRail } from "./quiz/view";
import { enterChatRail, leaveChatRail, renderChatRail } from "./chat/rail";
import { ensureChatOverlay, hideChatOverlay, openChatOverlay, pinChatOverlayNote } from "./chat/overlay";
import type { GraphPreviewNote } from "./archive/graphPreview";
import { connectedLinksHtml } from "./wiki/connectedHtml";
import { addOrigin, isOriginKind, originKey, removeOrigin } from "./origin/normalize";
import { resolvedOrigins } from "./origin/notesPlace";
import { originComposeFieldHtml, originPillsHtml, parseOriginRemoveValue } from "./origin/pills";
import { applyTopicTags, toggleTopicTag } from "./tidy/applyTags";
import { remainingTopicTags, topicTagPickerHtml } from "./tidy/tagPicker";
import { filterPickerOptions, optionPickerListHtml } from "./ui/optionPicker";

type View =
  | "list"
  | "graph"
  | "page"
  | "compose"
  | "chat"
  | "podcast"
  | "quiz";
type GraphMode = "constellation" | "showAll" | "universe";

const app = document.querySelector<HTMLDivElement>("#app")!;
const ROW_HEIGHT = 68;
const OVERSCAN = 8;

let entries: PageManifestEntry[] = [];
let visible: PageManifestEntry[] = [];
let view: View = "list";
let query = "";
let keywordFilter = "";
let originFilter = emptyOriginFilter();
let originLabelQuery = "";
let originLabelOpen = false;
let composeTagQuery = "";
let composeTagOpen = false;
let composeOriginDraft: Origin | null = null;
let activePage: Page | null = null;
let tidyBusy = false;
let listScrollTop = 0;
let graphTeardown: (() => void) | null = null;
let graphMount: GraphMount | null = null;
let graphMode: GraphMode = "constellation";
let showAllGrouping: ShowAllGrouping = "tags";
let graphSearch = "";
let orbitSpeed = 0.5;
let universeKeyOpen = false;
let universeDark = readUniverseDark(typeof localStorage === "undefined" ? null : localStorage);
let universeFullscreen = false;
let solarModelCache: { source: PageManifestEntry[]; model: SolarModel } | null = null;

function getSolarModel() {
  if (solarModelCache && solarModelCache.source === entries) return solarModelCache.model;
  const model = buildSolarModel(entries);
  solarModelCache = { source: entries, model };
  return model;
}

type ComposeState = {
  id: string;
  title: string;
  area: "notes" | "university";
  tags: string[];
  origins: Origin[];
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
    tags: [],
    origins: [],
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
    tags: [...page.tags],
    origins: [...resolvedOrigins(page)],
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
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h11v8H5z"/><path d="M8 14v3l3-3h5"/></svg>`,
  podcast: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10" r="3"/><path d="M8 10a4 4 0 0 0 8 0"/><path d="M6 10a6 6 0 0 0 12 0"/><path d="M12 13v6M9 19h6"/></svg>`,
  quiz: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v16H8z"/><path d="M11 8h2M11 12h2M11 16h1"/></svg>`,
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
  return originFilterTitle(originFilter) || keywordFilter || "Archive";
}

function archiveIsUnfiltered() {
  return !keywordFilter && !originFilter.kind;
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
  if (view === "chat") leaveChatRail();
}

function clearPageHash() {
  if (isPageHash(location.hash)) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
}

function resetOriginLabelChrome() {
  originLabelQuery = "";
  originLabelOpen = false;
}

function resetComposeTagChrome() {
  composeTagQuery = "";
  composeTagOpen = false;
  composeOriginDraft = null;
}

function goToHome() {
  leaveSpecialRails();
  const next = goHome({ view, query, keywordFilter, originFilter, activePage, compose });
  view = next.view;
  query = next.query;
  keywordFilter = next.keywordFilter;
  originFilter = next.originFilter;
  activePage = next.activePage;
  compose = next.compose;
  resetOriginLabelChrome();
  resetComposeTagChrome();
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
    <aside class="rail hub-rail" aria-label="Knowledge Hub">
      <div class="hub-rail__brand-block"><a href="#" class="hub-rail__brand" data-home>Knowledge Hub</a></div>
      <nav class="rail__nav hub-rail__nav">
        <button class="rail__btn hub-rail__link ${view === "list" && archiveIsUnfiltered() ? "is-current" : ""}" data-nav="all" type="button">${icons.archive}<span>Archive</span></button>
        <button class="rail__btn hub-rail__link ${view === "graph" ? "is-current" : ""}" data-nav="graph" type="button">${icons.graph}<span>Graph</span></button>
        <button class="rail__btn hub-rail__link ${view === "chat" ? "is-current" : ""}" data-nav="chat" type="button">${icons.chat}<span>Chat</span></button>
        <button class="rail__btn hub-rail__link ${view === "podcast" ? "is-current" : ""}" data-nav="podcast" type="button">${icons.podcast}<span>Podcast</span></button>
        <button class="rail__btn hub-rail__link ${view === "quiz" ? "is-current" : ""}" data-nav="quiz" type="button">${icons.quiz}<span>Quiz</span></button>
      </nav>
    </aside>
    <main class="canvas">${main}</main>
  </div>`;

  app.querySelector<HTMLAnchorElement>("[data-home]")!.onclick = event => { event.preventDefault(); goToHome(); };

  app.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.nav!;
      const special: Record<string, View> = {
        graph: "graph",
        chat: "chat",
        podcast: "podcast",
        quiz: "quiz",
      };
      if (special[next]) {
        leaveSpecialRails();
        view = special[next];
        activePage = null;
        clearPageHash();
        if (next === "podcast") enterPodcastRail();
        if (next === "quiz") enterQuizRail();
        if (next === "chat") enterChatRail();
        render();
        return;
      }
      leaveSpecialRails();
      keywordFilter = "";
      originFilter = emptyOriginFilter();
      resetOriginLabelChrome();
      resetComposeTagChrome();
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
    if (!pageMatchesOriginFilter(item, originFilter)) return false;
    return true;
  });
}

function rowHtml(item: PageManifestEntry) {
  const meta = cardMeta(item);
  const supporting = cardSupportingText(item.title, item.excerpt);
  return `<button class="card" type="button" data-id="${escapeHtml(item.id)}" style="height:${ROW_HEIGHT}px">
    <p class="card__meta">${meta ? escapeHtml(meta) : "—"}</p>
    <div>
      <h2 class="card__title">${escapeHtml(item.title)}</h2>
      ${supporting ? `<p class="card__excerpt">${escapeHtml(supporting)}</p>` : ""}
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
      `Private archive${originFilter.kind ? " · origin" : keywordFilter ? " · keyword" : ""}`,
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
          ? `<div class="tag-pills">
        <button class="tag-pill is-selected" data-clear-keyword type="button" aria-pressed="true">Clear “${escapeHtml(keywordFilter)}”</button>
      </div>`
          : ""
      }
    </div>
    ${originFilterHtml(entries, originFilter, { labelQuery: originLabelQuery, labelOpen: originLabelOpen })}
    <p class="list-count">${visible.length.toLocaleString()} notes</p>
    <div class="cards list-viewport" aria-label="Archive list"></div>
  `);

  app.querySelector<HTMLButtonElement>("[data-jump-graph]")!.onclick = () => {
    view = "graph";
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-new-note]")!.onclick = () => {
    compose = blankCompose();
    resetComposeTagChrome();
    view = "compose";
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-clear-keyword]")?.addEventListener("click", () => {
    keywordFilter = "";
    listScrollTop = 0;
    void refreshVisible().then(render);
  });
  const applyOriginFilter = () => {
    listScrollTop = 0;
    void refreshVisible().then(render);
  };

  app.querySelectorAll<HTMLButtonElement>("[data-origin-kind]").forEach(button => {
    button.onclick = () => {
      const kind = button.dataset.originKind ?? "";
      if (!isOriginKind(kind)) return;
      originFilter = toggleOriginKind(originFilter, kind);
      originLabelQuery = "";
      originLabelOpen = Boolean(originFilter.kind);
      applyOriginFilter();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-origin-label]").forEach(button => {
    button.onclick = () => {
      originFilter = toggleOriginLabel(originFilter, button.dataset.originLabel ?? "");
      originLabelQuery = "";
      originLabelOpen = !originFilter.label;
      applyOriginFilter();
    };
  });
  const bindOriginOptions = () => {
    app.querySelectorAll<HTMLButtonElement>("[data-origin-option]").forEach(button => {
      button.onclick = () => {
        originFilter = toggleOriginLabel(originFilter, button.dataset.originOption ?? "");
        originLabelQuery = "";
        originLabelOpen = false;
        applyOriginFilter();
      };
    });
  };
  bindOriginOptions();
  app.querySelector<HTMLButtonElement>("[data-picker-open]")?.addEventListener("click", () => {
    originLabelOpen = true;
    render();
  });
  app.querySelector<HTMLButtonElement>("[data-picker-close]")?.addEventListener("click", () => {
    originLabelOpen = false;
    originLabelQuery = "";
    render();
  });
  app.querySelector<HTMLButtonElement>("[data-clear-origin]")?.addEventListener("click", () => {
    originFilter = emptyOriginFilter();
    resetOriginLabelChrome();
    applyOriginFilter();
  });
  const originSearch = app.querySelector<HTMLInputElement>("#origin-label-search");
  const originKind = originFilter.kind;
  if (originSearch && originKind) {
    const rewriteOriginList = () => {
      const list = app.querySelector("[data-picker-list]");
      if (!list) return;
      const remaining = originLabelsForKind(entries, originKind)
        .filter(item => item.label.toLowerCase() !== originFilter.label.toLowerCase())
        .map(item => ({ label: item.label, detail: String(item.count) }));
      list.innerHTML = optionPickerListHtml({
        options: filterPickerOptions(remaining, originLabelQuery),
        optionAttr: "data-origin-option",
        emptyLabel: "Nothing matches that.",
      });
      bindOriginOptions();
    };
    originSearch.oninput = () => {
      originLabelQuery = originSearch.value;
      rewriteOriginList();
    };
    originSearch.onkeydown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      originLabelOpen = false;
      originLabelQuery = "";
      render();
    };
    originSearch.focus();
    originSearch.setSelectionRange(originLabelQuery.length, originLabelQuery.length);
  }

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

function showAllTuningHtml() {
  return `<div class="graph-tuning" role="group" aria-label="Show All tuning">
    ${SHOW_ALL_TUNING_CONTROLS.map(control => {
      const value = showAllTuning[control.key];
      const slider = sliderValueForTuning(control);
      return `<label class="graph-speed">
        <span class="graph-speed__label">${escapeHtml(control.label)}</span>
        <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${slider}" data-show-all-tune="${control.key}" aria-label="${escapeHtml(control.label)}" />
        <output class="graph-speed__value" data-show-all-tune-value="${control.key}">${escapeHtml(control.format(value))}</output>
      </label>`;
    }).join("")}
  </div>`;
}

function showAllModel() {
  return buildShowAllGraph(entries, showAllGrouping);
}

function showAllMetaText() {
  if (showAllGrouping !== "tags") return showAllGroupingMeta(showAllGrouping);
  const model = showAllModel();
  const notes = model.nodes.filter(node => node.kind === "leaf").length;
  const hidden = Math.max(0, entries.length - notes);
  return hidden
    ? `${notes} tagged · ${model.majorCount} topics · ${hidden} still untagged`
    : `${notes} tagged · ${model.majorCount} topics`;
}

function graphMetaText() {
  const constellation = buildArchiveGraph(entries);
  const meta =
    constellation.majorCount === 0 && graphMode !== "showAll"
      ? "No topic keywords yet · Universe still has a sun"
      : graphMode === "constellation"
        ? `${constellation.majorCount} topics · click a hub to open its constellation`
        : graphMode === "showAll"
          ? showAllMetaText()
          : `Universe v${UNIVERSE_BUILD}`;
  const searching = graphSearch.trim();
  let searchHint = searching ? ` · search “${searching}”` : "";
  if (searching) {
    const hits =
      graphMode === "universe"
        ? resolveSearchHits(getSolarModel(), graphSearch).size
        : searchCluster(
            (graphMode === "showAll" ? showAllModel() : constellation).nodes,
            graphSearch,
          ).size;
    if (!hits) searchHint += " · no matches";
    else if (graphMode === "universe") searchHint += ` · ${hits} match${hits === 1 ? "" : "es"}`;
  }
  return `${meta}${searchHint}`;
}

function writeGraphChrome() {
  const meta = app.querySelector(".graph-toolbar__meta");
  if (meta) meta.textContent = graphMetaText();
  app.querySelectorAll<HTMLButtonElement>("[data-show-all-group]").forEach(button => {
    const active = button.dataset.showAllGroup === showAllGrouping;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderGraph() {
  const constellation = buildArchiveGraph(entries);
  const excerptFor = (pageId: string) => entries.find(entry => entry.id === pageId)?.excerpt ?? "";

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
    <div class="${graphMode === "universe" ? universeWrapClass(universeDark, universeFullscreen) : "graph-wrap"}">
      <div class="graph-toolbar glass-panel">
        <div class="graph-modes" role="group" aria-label="Graph mode">
          <button type="button" data-graph-mode="constellation" class="${graphMode === "constellation" ? "is-active" : ""}">Constellation</button>
          <button type="button" data-graph-mode="showAll" class="${graphMode === "showAll" ? "is-active" : ""}">Show All</button>
          <button type="button" data-graph-mode="universe" class="${graphMode === "universe" ? "is-active" : ""}">Universe</button>
        </div>
        ${
          graphMode === "showAll"
            ? `<div class="graph-modes" role="group" aria-label="Show All grouping">
                ${SHOW_ALL_GROUPINGS.map(
                  grouping =>
                    `<button type="button" data-show-all-group="${grouping}" aria-pressed="${grouping === showAllGrouping}" class="${grouping === showAllGrouping ? "is-active" : ""}">${showAllGroupingLabel(grouping)}</button>`,
                ).join("")}
              </div>`
            : ""
        }
        <input class="graph-search" type="search" placeholder="Search keywords and notes" value="${escapeHtml(graphSearch)}" />
        ${graphMode === "showAll" ? showAllTuningHtml() : ""}
        ${
          graphMode === "universe"
            ? `<label class="graph-speed">
                <span class="graph-speed__label">Orbit speed</span>
                <input type="range" min="0" max="1" step="0.05" value="${orbitSpeed}" data-orbit-speed />
                <output class="graph-speed__value" data-orbit-speed-value>${orbitSpeedLabel(orbitSpeed)}</output>
              </label>
              ${universeViewToolsHtml(universeDark, universeFullscreen)}`
            : ""
        }
        <p class="graph-toolbar__meta">${escapeHtml(graphMetaText())}</p>
      </div>
      <div class="graph-stage"></div>
      ${graphMode === "universe" ? universeKeyHtml(universeKeyOpen) : ""}
      ${graphMode === "universe" ? universeExitHtml(universeFullscreen) : ""}
    </div>
  `);

  app.querySelector<HTMLButtonElement>("[data-jump-list]")!.onclick = () => {
    universeFullscreen = false;
    document.body.classList.remove("is-universe-fullscreen");
    view = "list";
    render();
  };

  app.querySelectorAll<HTMLButtonElement>("[data-graph-mode]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.graphMode as GraphMode;
      if (next === graphMode) return;
      if (next !== "universe") universeFullscreen = false;
      graphMode = next;
      render();
    };
  });

  app.querySelectorAll<HTMLButtonElement>("[data-show-all-group]").forEach(button => {
    button.onclick = () => {
      const next = button.dataset.showAllGroup as ShowAllGrouping;
      if (!next || next === showAllGrouping) return;
      showAllGrouping = next;
      writeGraphChrome();
      graphMount?.setModel(showAllModel());
    };
  });

  const search = app.querySelector<HTMLInputElement>(".graph-search")!;
  search.oninput = () => {
    graphSearch = search.value;
    graphMount?.setSearch(graphSearch);
    writeGraphChrome();
  };

  app.querySelectorAll<HTMLInputElement>("[data-show-all-tune]").forEach(input => {
    input.oninput = () => {
      const control = SHOW_ALL_TUNING_CONTROLS.find(item => item.key === input.dataset.showAllTune);
      if (!control) return;
      const next = { [control.key]: tuningFromSlider(control, Number(input.value)) };
      applyShowAllTuning(next);
      const readout = app.querySelector<HTMLOutputElement>(`[data-show-all-tune-value="${control.key}"]`);
      if (readout) readout.textContent = control.format(showAllTuning[control.key]);
      graphMount?.setTuning(next);
    };
  });

  const wrap = app.querySelector<HTMLElement>(".graph-wrap")!;
  const stage = app.querySelector<HTMLElement>(".graph-stage")!;
  if (graphMode === "universe") {
    applyUniverseViewState(wrap, document.body, universeDark, universeFullscreen);
    bindUniverseKey(app, open => {
      universeKeyOpen = open;
    });
    bindUniverseView(app, {
      getDark: () => universeDark,
      getFullscreen: () => universeFullscreen,
      setDark: on => {
        universeDark = on;
        writeUniverseDark(on, typeof localStorage === "undefined" ? null : localStorage);
        applyUniverseViewState(wrap, document.body, universeDark, universeFullscreen);
      },
      setFullscreen: on => {
        universeFullscreen = on;
        applyUniverseViewState(wrap, document.body, universeDark, universeFullscreen);
      },
    });
  } else {
    document.body.classList.remove("is-universe-fullscreen");
  }
  const preview = mountGraphPreview(wrap, { onOpen: openPageInNewTab });
  const onNoteSelect = (note: { pageId: string; title: string; excerpt: string } | null) => {
    if (!note) {
      preview.clear();
      return;
    }
    const card = previewNote(note.pageId, note.title, note.excerpt || excerptFor(note.pageId));
    preview.show(card);
    pinChatOverlayNote({ pageId: card.pageId, title: card.title });
  };

  document.onkeydown = event => {
    if (shouldExitUniverseFullscreen(event.key, universeFullscreen && graphMode === "universe")) {
      event.preventDefault();
      universeFullscreen = false;
      applyUniverseViewState(wrap, document.body, universeDark, false);
      return;
    }
    if (event.key !== "Enter") return;
    const open = preview.el.querySelector<HTMLButtonElement>("[data-open-note]");
    if (open && !preview.el.hidden) open.click();
  };

  let mounted: GraphMount;
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
    mounted = mountSolarView(stage, getSolarModel(), {
      search: graphSearch,
      onNoteSelect,
      clock,
    });
  } else {
    mounted = mountForceGraph(
      stage,
      graphMode === "showAll" ? showAllModel() : constellation,
      { onNoteSelect },
      { variant: graphMode, search: graphSearch, excerptFor },
    );
  }
  graphMount = mounted;
  graphTeardown = () => {
    document.onkeydown = null;
    document.body.classList.remove("is-universe-fullscreen");
    graphMount = null;
    mounted();
  };
}

function archiveNotes() {
  return entries.map(entry => ({ pageId: entry.id, title: entry.title }));
}

async function openPage(id: string, title?: string) {
  const resolved = resolveArchivePageId(id, title, archiveNotes());
  try {
    activePage = await getPage(resolved);
  } catch {
    const hits = title ? await searchPages(title).catch(() => []) : [];
    const fallback = resolveArchivePageId(resolved, title, hits);
    if (fallback === resolved) {
      showToast("That note isn't in the archive.");
      return;
    }
    try {
      activePage = await getPage(fallback);
    } catch {
      showToast("That note isn't in the archive.");
      return;
    }
  }
  view = "page";
  const next = pageHashForId(activePage.id);
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

function renderPage(page: Page) {
  const topics = topicKeywords(page.tags);
  const openCompose = (draft: Origin | null = null) => {
    compose = composeFromPage(page);
    resetComposeTagChrome();
    composeOriginDraft = draft;
    view = "compose";
    render();
  };

  shell(`
    ${pageHeader(
      topics[0] ? escapeHtml(topics[0]) : "Note",
      escapeHtml(page.title),
      `<button class="btn btn--ghost reader__back" data-back type="button">← Archive</button>
        <button class="btn btn--ghost" data-edit type="button">Edit</button>
        <button class="btn btn--ghost reader__tidy" data-tidy type="button" ${tidyBusy ? "disabled" : ""}>${tidyBusy ? "Cleaning up…" : "Clean up"}</button>
        <button class="btn btn--ghost" data-open-chat type="button">Chat</button>`,
    )}
    <article class="reader">
      ${originPillsHtml(resolvedOrigins(page), { openEdit: true })}
      ${readerTopicPillsHtml(topics.slice(0, 6))}
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
  app.querySelector<HTMLButtonElement>("[data-edit]")!.onclick = () => openCompose();
  app.querySelectorAll<HTMLButtonElement>("[data-edit-origins]").forEach(button => {
    button.onclick = () => openCompose(parseOriginRemoveValue(button.dataset.editOrigins ?? ""));
  });
  app.querySelector<HTMLButtonElement>("[data-open-chat]")!.onclick = () => {
    openChatOverlay({ note: { pageId: page.id, title: page.title } });
  };
  app.querySelector<HTMLButtonElement>("[data-tidy]")!.onclick = async () => {
    if (tidyBusy) return;
    tidyBusy = true;
    render();
    try {
      activePage = await tidyPage(page.id, page.updated_at);
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
        `<button class="btn btn--ghost reader__back" data-compose-cancel type="button">← Cancel</button>`,
      )}
      ${USE_LOCAL_DATA ? `<p class="local-banner">Saving and capture need the live API (npx netlify dev).</p>` : ""}
      <div class="compose__field">
        <label for="compose-title">Title</label>
        <input id="compose-title" value="${escapeHtml(state.title)}" />
        ${state.titleError ? `<p class="compose__error">${escapeHtml(state.titleError)}</p>` : ""}
      </div>
      <div class="compose__field">
        <label id="compose-tags-label">Tags</label>
        <p class="compose__hint">Up to 3.</p>
        <div role="group" aria-labelledby="compose-tags-label">
          ${topicTagPickerHtml(state.tags, composeTagQuery, composeTagOpen)}
        </div>
      </div>
      ${originComposeFieldHtml(state.origins, composeOriginDraft)}
      <div class="compose__field compose__field--body">
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
    resetComposeTagChrome();
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
  app.querySelectorAll<HTMLButtonElement>("[data-tag-pill]").forEach(button => {
    button.onclick = () => {
      if (!compose) return;
      syncFields();
      compose.tags = toggleTopicTag(compose.tags, button.dataset.tagPill ?? "");
      composeTagQuery = "";
      composeTagOpen = false;
      render();
    };
  });
  const bindTagOptions = () => {
    app.querySelectorAll<HTMLButtonElement>("[data-tag-option]").forEach(button => {
      button.onclick = () => {
        if (!compose) return;
        syncFields();
        compose.tags = toggleTopicTag(compose.tags, button.dataset.tagOption ?? "");
        composeTagQuery = "";
        composeTagOpen = false;
        render();
      };
    });
  };
  bindTagOptions();
  app.querySelector<HTMLButtonElement>("[data-picker-open]")?.addEventListener("click", () => {
    if (!compose) return;
    syncFields();
    composeTagOpen = true;
    render();
  });
  app.querySelector<HTMLButtonElement>("[data-picker-close]")?.addEventListener("click", () => {
    if (!compose) return;
    syncFields();
    composeTagOpen = false;
    composeTagQuery = "";
    render();
  });
  const tagSearch = app.querySelector<HTMLInputElement>("#compose-tag-search");
  if (tagSearch && compose) {
    const draft = compose;
    const rewriteTagList = () => {
      const list = app.querySelector("[data-picker-list]");
      if (!list) return;
      list.innerHTML = optionPickerListHtml({
        options: filterPickerOptions(remainingTopicTags(draft.tags), composeTagQuery),
        optionAttr: "data-tag-option",
        emptyLabel: "No tags match that.",
      });
      bindTagOptions();
    };
    tagSearch.oninput = () => {
      composeTagQuery = tagSearch.value;
      rewriteTagList();
    };
    tagSearch.onkeydown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      syncFields();
      composeTagOpen = false;
      composeTagQuery = "";
      render();
    };
    tagSearch.focus();
    tagSearch.setSelectionRange(composeTagQuery.length, composeTagQuery.length);
  }
  const addOriginFromFields = () => {
    if (!compose) return;
    syncFields();
    const kind = app.querySelector<HTMLSelectElement>("#compose-origin-kind")?.value ?? "";
    const label = app.querySelector<HTMLInputElement>("#compose-origin-label")?.value ?? "";
    if (!isOriginKind(kind) || !label.trim()) return;
    const next = composeOriginDraft
      ? addOrigin(removeOrigin(compose.origins, composeOriginDraft), { kind, label })
      : addOrigin(compose.origins, { kind, label });
    compose.origins = next;
    composeOriginDraft = null;
    render();
  };
  app.querySelector<HTMLButtonElement>("[data-origin-add]")?.addEventListener("click", addOriginFromFields);
  app.querySelector<HTMLInputElement>("#compose-origin-label")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addOriginFromFields();
    }
  });
  app.querySelectorAll<HTMLButtonElement>("[data-origin-remove]").forEach(button => {
    button.onclick = () => {
      if (!compose) return;
      syncFields();
      const target = parseOriginRemoveValue(button.dataset.originRemove ?? "");
      if (!target) return;
      compose.origins = removeOrigin(compose.origins, target);
      if (composeOriginDraft && originKey(composeOriginDraft) === originKey(target)) {
        composeOriginDraft = null;
      }
      render();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-origin-edit]").forEach(button => {
    button.onclick = () => {
      if (!compose) return;
      syncFields();
      composeOriginDraft = parseOriginRemoveValue(button.dataset.originEdit ?? "");
      render();
    };
  });
  if (composeOriginDraft) {
    app.querySelector<HTMLInputElement>("#compose-origin-label")?.focus();
  }
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
      tags: applyTopicTags(snapshot.tags, snapshot.tags),
      origins: snapshot.origins,
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
    resetComposeTagChrome();
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

function openPageInNewTab(id: string) {
  const url = `${location.pathname}${location.search}${pageHashForId(id)}`;
  window.open(url, "_blank", "noopener");
}

function previewNote(pageId: string, title: string, excerpt: string): GraphPreviewNote {
  const entry = entries.find(item => item.id === pageId);
  return {
    pageId,
    title: entry?.title ?? title,
    excerpt: excerpt || entry?.excerpt || "",
    tags: entry?.tags,
    origins: entry ? resolvedOrigins(entry) : [],
  };
}

function afterSignedInPaint() {
  ensureChatOverlay({
    visible: true,
    onOpenPage: (pageId, title) => void openPage(pageId, title),
    onSavedPage: async saved => {
      entries = await listPages();
      await refreshVisible();
      if (activePage?.id === saved.id) activePage = saved;
      render();
    },
    topicsFor: pageId => {
      const entry = entries.find(item => item.id === pageId);
      return entry ? topicKeywords(entry.tags) : [];
    },
    archiveNotes: archiveNotes(),
  });
}

function render() {
  if (view === "compose" && compose) renderCompose(compose);
  else if (view === "page" && activePage) renderPage(activePage);
  else if (view === "graph") renderGraph();
  else if (view === "chat") {
    renderChatRail({
      app,
      shell,
      render,
      onOpenPage: (pageId, title) => void openPage(pageId, title),
      onSavedPage: async saved => {
        entries = await listPages();
        await refreshVisible();
        await openPage(saved.id);
      },
      pageHeader,
      archiveNotes: archiveNotes(),
    });
  } else if (view === "podcast") {
    renderPodcastRail({
      app,
      tags: vocabularyPresent(entries.map(entry => entry.tags)),
      shell,
      render,
      onOpenPage: pageId => void openPage(pageId),
    });
  } else if (view === "quiz") {
    renderQuizRail({
      app,
      entries,
      tags: vocabularyPresent(entries.map(entry => entry.tags)),
      shell,
      render,
      onOpenPage: id => void openPage(id),
    });
  } else {
    renderList();
  }
  afterSignedInPaint();
}

function showSignInError(message?: string) {
  const error = app.querySelector<HTMLParagraphElement>(".sign-in__error");
  if (!error) return;
  if (!message) {
    error.hidden = true;
    error.textContent = "";
    return;
  }
  error.hidden = false;
  error.textContent = message;
}

function bindSignInEnter(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>("#sign-in-passphrase");
  input?.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function renderLoadError() {
  hideChatOverlay();
  app.innerHTML = `<div class="sign-in">
    <div class="sign-in__card">
      <p class="sign-in__brand">Knowledge Hub</p>
      <h1 class="sign-in__title">Couldn't load the archive</h1>
      <p class="sign-in__error" role="alert">Signed in, but the archive did not load.</p>
      <button class="btn btn--primary sign-in__submit" type="button" data-retry>Try again</button>
    </div>
  </div>`;
  app.querySelector<HTMLButtonElement>("[data-retry]")!.onclick = () => {
    void boot({ signedIn: true });
  };
}

function renderLogin(message?: string) {
  hideChatOverlay();
  app.innerHTML = `<div class="sign-in">
    <form class="sign-in__card" method="post" action="#" novalidate>
      <div class="sign-in__haze" aria-hidden="true">
        <span class="sign-in__haze-mist"></span>
        <span class="sign-in__bubble"></span>
        <span class="sign-in__bubble"></span>
        <span class="sign-in__bubble"></span>
        <span class="sign-in__bubble"></span>
        <span class="sign-in__bubble"></span>
        <span class="sign-in__sparkle"></span>
        <span class="sign-in__sparkle"></span>
        <span class="sign-in__sparkle"></span>
        <span class="sign-in__sparkle"></span>
        <span class="sign-in__sparkle"></span>
        <span class="sign-in__sparkle"></span>
      </div>
      <p class="sign-in__brand">Knowledge Hub</p>
      <h1 class="sign-in__title">Sign in</h1>
      <div class="sign-in__field">
        <label class="sign-in__label" for="sign-in-passphrase">Passphrase</label>
        <input class="sign-in__input" id="sign-in-passphrase" name="passphrase" type="password" required autocomplete="current-password" enterkeyhint="go" />
      </div>
      <p class="sign-in__error" role="alert" hidden></p>
      <button class="btn btn--primary sign-in__submit" type="submit">Sign in</button>
    </form>
  </div>`;
  showSignInError(message);
  const form = app.querySelector<HTMLFormElement>("form.sign-in__card")!;
  const input = form.querySelector<HTMLInputElement>("#sign-in-passphrase");
  bindSignInEnter(form);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    showSignInError();
    const button = form.querySelector<HTMLButtonElement>(".sign-in__submit");
    if (button) button.disabled = true;
    try {
      const ok = await login(input?.value ?? "");
      if (!ok) {
        showSignInError("Invalid passphrase");
        return;
      }
      if (!(await fetchSession())) {
        showSignInError("Unable to sign in. Please try again.");
        return;
      }
      await boot({ signedIn: true });
    } catch {
      showSignInError("Unable to sign in. Please try again.");
    } finally {
      if (button) button.disabled = false;
      input?.focus();
    }
  });
  input?.focus();
}

async function boot(options?: { failedLoginMessage?: string; signedIn?: boolean }) {
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
    if (options?.signedIn) {
      const stillIn = await fetchSession().catch(() => false);
      if (stillIn) {
        renderLoadError();
        return;
      }
      renderLogin("Unable to sign in. Please try again.");
      return;
    }
    if (options?.failedLoginMessage) {
      renderLogin(options.failedLoginMessage);
      return;
    }
    const bounced = takeSignInQuery(location.href);
    if (bounced.message) history.replaceState(null, "", bounced.nextUrl);
    renderLogin(bounced.message ?? undefined);
  }
}

boot();
