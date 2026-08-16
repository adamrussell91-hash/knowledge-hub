import { curatorAction, listCuratorPending, WIKI_NEEDS_NETLIFY, USE_LOCAL_DATA } from "../api/wikiClient";
import type { PendingProposal } from "../curator/schema";
import { escapeHtml } from "../lib/dom";

export type WikiRailHost = {
  app: HTMLElement;
  shell: (main: string) => void;
  render: () => void;
  onOpenPage?: (pageId: string) => void;
};

let pending: PendingProposal[] = [];
let busy = false;
let wikiError = "";
let needQueue = true;
let queueLoading = false;
let mounted = false;

export function enterWikiRail() {
  needQueue = true;
}

export function leaveWikiRail() {
  mounted = false;
}

function wikiVisible() {
  return mounted && Boolean(document.querySelector("section.wiki"));
}

function failMessage(error: unknown) {
  return error instanceof Error && error.message === WIKI_NEEDS_NETLIFY
    ? error.message
    : error instanceof Error
      ? error.message
      : "Wiki update failed";
}

function ensureQueue(host: WikiRailHost) {
  if (USE_LOCAL_DATA || queueLoading || !needQueue) return;
  needQueue = false;
  queueLoading = true;
  busy = true;
  wikiError = "";
  void listCuratorPending()
    .then(rows => {
      pending = rows;
    })
    .catch((error: unknown) => {
      if (!wikiError) wikiError = failMessage(error);
      pending = [];
    })
    .finally(() => {
      queueLoading = false;
      busy = false;
      if (wikiVisible()) host.render();
    });
}

async function runAction(host: WikiRailHost, action: "approve" | "dismiss" | "approve-all" | "dismiss-all" | "run", id?: string) {
  if (busy) return;
  busy = true;
  wikiError = "";
  host.render();
  try {
    const result = await curatorAction(action, id);
    if (action === "run") {
      wikiError = "Curator queued. Proposals appear after the Action finishes.";
    } else if (result.pending) {
      pending = result.pending;
    } else {
      pending = await listCuratorPending();
    }
  } catch (error) {
    wikiError = failMessage(error);
  } finally {
    busy = false;
    host.render();
  }
}

function cardsHtml() {
  if (busy && !pending.length) return `<p class="empty">Loading proposals…</p>`;
  if (!busy && !pending.length) {
    return `<p class="empty">No pending links. Run now after you capture, or wait for the nightly pass.</p>`;
  }
  return pending
    .map(
      item => `<article class="glass-panel wiki-card">
                  <p class="wiki-card__relation">${escapeHtml(item.relation)}</p>
                  <div class="wiki-card__pair">
                    <button type="button" data-open-page="${escapeHtml(item.noteA)}">
                      <strong>${escapeHtml(item.titleA)}</strong>
                      <span>${escapeHtml(item.excerptA)}</span>
                    </button>
                    <button type="button" data-open-page="${escapeHtml(item.noteB)}">
                      <strong>${escapeHtml(item.titleB)}</strong>
                      <span>${escapeHtml(item.excerptB)}</span>
                    </button>
                  </div>
                  <p class="wiki-card__why">${escapeHtml(item.rationale)}</p>
                  <div class="alchemist__actions">
                    <button type="button" data-wiki-approve="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>Approve</button>
                    <button type="button" data-wiki-dismiss="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>Dismiss</button>
                  </div>
                </article>`,
    )
    .join("");
}

function bind(host: WikiRailHost) {
  host.app.querySelector<HTMLButtonElement>("[data-wiki-run]")?.addEventListener("click", () => {
    void runAction(host, "run");
  });
  host.app.querySelector<HTMLButtonElement>("[data-wiki-approve-all]")?.addEventListener("click", () => {
    void runAction(host, "approve-all");
  });
  host.app.querySelector<HTMLButtonElement>("[data-wiki-dismiss-all]")?.addEventListener("click", () => {
    void runAction(host, "dismiss-all");
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-wiki-approve]").forEach(button => {
    button.onclick = () => void runAction(host, "approve", button.dataset.wikiApprove);
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-wiki-dismiss]").forEach(button => {
    button.onclick = () => void runAction(host, "dismiss", button.dataset.wikiDismiss);
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => host.onOpenPage?.(button.dataset.openPage!);
  });
}

export function renderWikiRail(host: WikiRailHost) {
  mounted = true;
  ensureQueue(host);
  host.shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · Wiki proposals need the Netlify API (session) and the data repo.</p>` : ""}
    <header class="topbar page-header">
      <div class="page-header__copy">
        <p class="eyebrow page-header__eyebrow">Self-maintaining wiki</p>
        <h1 class="page-header__title">Wiki</h1>
      </div>
    </header>
    <section class="alchemist wiki">
      <div class="alchemist__actions">
        <button type="button" data-wiki-run ${busy ? "disabled" : ""}>Run now</button>
        ${
          pending.length
            ? `<button type="button" data-wiki-approve-all ${busy ? "disabled" : ""}>Approve all</button>
               <button type="button" data-wiki-dismiss-all ${busy ? "disabled" : ""}>Dismiss all</button>`
            : ""
        }
      </div>
      ${wikiError ? `<p class="alchemist__error">${escapeHtml(wikiError)}</p>` : ""}
      ${cardsHtml()}
    </section>
  `);
  bind(host);
}
