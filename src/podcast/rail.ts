import {
  PODCAST_NEEDS_NETLIFY,
  USE_LOCAL_DATA,
  getPodcast,
  listPodcasts,
  nextPodcastEpisode,
  startPodcast,
  startPodcastSeries,
} from "../api/client";
import { topicKeywords } from "../archive/keywordGraph";
import { escapeHtml } from "../lib/dom";
import type { ResearchScope } from "../research/scope";
import { playerHtml, bindPlayer, resetPlayer } from "./playerView";
import {
  PodcastDialsSchema,
  type PodcastDials,
  type PodcastEpisode,
  type PodcastMode,
  type PodcastSeries,
} from "./schema";

export type PodcastRailHost = {
  app: HTMLElement;
  tags: string[];
  shell: (main: string) => void;
  render: () => void;
  onOpenPage?: (pageId: string) => void;
};

type Kind = "one-off" | "series";
type Area = "all" | "university" | "notes";

const MODES: PodcastMode[] = ["recap", "connector", "quiz", "debate"];
const CADENCES = ["weekly", "monthly", "half-yearly", "yearly"] as const;
const LENGTHS = ["short", "standard", "deep"] as const;
const COMPLEXITIES = ["plain", "academic"] as const;
const CITATIONS = ["light", "normal", "heavy"] as const;
const FORMALITIES = ["dry-academic", "staffroom", "mates"] as const;
const BANTERS = ["low", "medium", "high"] as const;
const DISAGREEMENTS = ["mild", "medium", "sharp"] as const;
const PACINGS = ["linger", "even", "race"] as const;
const INTERRUPTIONS = ["finish-thought", "immediate"] as const;

let kind: Kind = "one-off";
let mode: PodcastMode | "" = "recap";
let recapCadence: (typeof CADENCES)[number] = "weekly";
let clusterA = "";
let clusterB = "";
let positionA = "";
let positionB = "";
let area: Area = "all";
let selectedTags: string[] = [];
let topic = "";
let runLength = 8;
let seriesCadence: (typeof CADENCES)[number] = "weekly";
let dials: PodcastDials = PodcastDialsSchema.parse({});
let advancedOpen = false;
let busy = false;
let statusNote = "";
let podcastError = "";
let current: PodcastEpisode | null = null;
let library: { episodes: PodcastEpisode[]; series: PodcastSeries[] } = { episodes: [], series: [] };
let needLibrary = true;
let libraryLoading = false;
let pollTimer: number | null = null;
let mounted = false;

export function enterPodcastRail() {
  needLibrary = true;
}

export function leavePodcastRail() {
  mounted = false;
  stopPoll();
  resetPlayer();
}

function stopPoll() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function podcastVisible() {
  return mounted && Boolean(document.querySelector("section.podcast"));
}

function labelize(value: string) {
  if (value === "heavy") return "footnote-heavy";
  return value.replace(/-/g, " ");
}

function options(values: readonly string[], selected: string) {
  return values
    .map(
      value =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labelize(value))}</option>`,
    )
    .join("");
}

function clusterOptions(tags: string[]) {
  const topics = topicKeywords(tags);
  return topics.length ? topics : tags;
}

function scope(): ResearchScope | undefined {
  const tags = selectedTags.filter(Boolean);
  if (area === "all" && !tags.length) return undefined;
  return {
    ...(area !== "all" ? { area } : {}),
    ...(tags.length ? { tags } : {}),
  };
}

function modeDial(): Record<string, string> {
  if (mode === "recap") return { cadence: recapCadence };
  if (mode === "connector") return { clusterA: clusterA.trim(), clusterB: clusterB.trim() };
  if (mode === "debate") return { positionA: positionA.trim(), positionB: positionB.trim() };
  return {};
}

function canPost() {
  if (kind === "one-off") {
    if (!mode) return false;
    if (mode === "connector" && (!clusterA.trim() || !clusterB.trim())) return false;
    if (mode === "debate" && (!positionA.trim() || !positionB.trim())) return false;
    return true;
  }
  if (!topic.trim()) return false;
  if (!Number.isInteger(runLength) || runLength < 4 || runLength > 12) return false;
  return true;
}

function failMessage(error: unknown) {
  return error instanceof Error && error.message === PODCAST_NEEDS_NETLIFY
    ? error.message
    : "Podcast failed.";
}

function episodeFailure(episode: PodcastEpisode) {
  return episode.error?.trim() || "Podcast failed.";
}

function runningNote(episode: PodcastEpisode) {
  if (episode.seriesId && (episode.episodeIndex ?? 1) === 1) return "writing episode 1";
  if (!episode.turns.length) return "writing the script…";
  const spoken = episode.turns.filter(turn => turn.audioKey).length;
  const speakable = episode.turns.filter(turn => turn.kind !== "cue" && turn.kind !== "empty").length;
  if (!speakable) return "recording…";
  return `recording turn ${Math.min(spoken + 1, speakable)}/${speakable}`;
}

function formatDate(iso: string) {
  return iso.slice(0, 10) || iso;
}

function canNext(series: PodcastSeries) {
  const nextSlot = series.slots.find(slot => !slot.episodeId);
  if (!nextSlot) return false;
  const previous = [...series.slots]
    .filter(slot => slot.index < nextSlot.index && slot.episodeId)
    .sort((left, right) => right.index - left.index)[0];
  if (!previous?.episodeId) return true;
  const episode = library.episodes.find(item => item.id === previous.episodeId);
  if (!episode) return true;
  return episode.status === "ready" || episode.status === "cancelled";
}

async function refreshLibrary() {
  if (USE_LOCAL_DATA) return;
  library = await listPodcasts();
}

function ensureLibrary(host: PodcastRailHost) {
  if (USE_LOCAL_DATA || libraryLoading || !needLibrary) return;
  needLibrary = false;
  libraryLoading = true;
  void listPodcasts()
    .then(data => {
      library = data;
    })
    .catch((error: unknown) => {
      if (!podcastError) podcastError = failMessage(error);
    })
    .finally(() => {
      libraryLoading = false;
      host.render();
    });
}

function startPoll(host: PodcastRailHost, id: string) {
  stopPoll();
  pollTimer = window.setInterval(() => {
    void (async () => {
      try {
        current = await getPodcast(id);
        if (current.status === "running") {
          statusNote = runningNote(current);
          if (podcastVisible()) host.render();
          return;
        }
        stopPoll();
        busy = false;
        statusNote = "";
        if (current.status === "error") podcastError = episodeFailure(current);
        try {
          await refreshLibrary();
        } catch {
          /* keep the episode we already have */
        }
        if (podcastVisible()) host.render();
      } catch (error) {
        stopPoll();
        busy = false;
        statusNote = "";
        podcastError = failMessage(error);
        if (podcastVisible()) host.render();
      }
    })();
  }, 2000);
}

function modeDialHtml(tags: string[]) {
  if (mode === "recap") {
    return `<label for="podcast-cadence">Cadence</label>
      <select id="podcast-cadence">${options(CADENCES, recapCadence)}</select>`;
  }
  if (mode === "connector") {
    const clusters = clusterOptions(tags);
    const blank = `<option value="">Choose a cluster</option>`;
    return `<label for="podcast-cluster-a">Cluster A</label>
      <select id="podcast-cluster-a">${blank}${options(clusters, clusterA)}</select>
      <label for="podcast-cluster-b">Cluster B</label>
      <select id="podcast-cluster-b">${blank}${options(clusters, clusterB)}</select>`;
  }
  if (mode === "debate") {
    return `<label for="podcast-position-a">Position A</label>
      <input id="podcast-position-a" type="text" value="${escapeHtml(positionA)}" />
      <label for="podcast-position-b">Position B</label>
      <input id="podcast-position-b" type="text" value="${escapeHtml(positionB)}" />`;
  }
  return "";
}

function advancedHtml() {
  return `<details class="podcast-advanced" ${advancedOpen ? "open" : ""}>
    <summary>Advanced</summary>
    <label for="podcast-length">Length</label>
    <select id="podcast-length">${options(LENGTHS, dials.length)}</select>
    <label for="podcast-complexity">Complexity</label>
    <select id="podcast-complexity">${options(COMPLEXITIES, dials.complexity)}</select>
    <label for="podcast-citation">Citation density</label>
    <select id="podcast-citation">${options(CITATIONS, dials.citationDensity)}</select>
    <label for="podcast-formality">Formality</label>
    <select id="podcast-formality">${options(FORMALITIES, dials.formality)}</select>
    <label for="podcast-banter">Banter</label>
    <select id="podcast-banter">${options(BANTERS, dials.banter)}</select>
    <label for="podcast-disagreement">Disagreement</label>
    <select id="podcast-disagreement">${options(DISAGREEMENTS, dials.disagreement)}</select>
    <label for="podcast-chicken">Chicken</label>
    <select id="podcast-chicken">${[0, 1, 2, 3]
      .map(value => `<option value="${value}" ${dials.chicken === value ? "selected" : ""}>${value}</option>`)
      .join("")}</select>
    <label for="podcast-pacing">Pacing</label>
    <select id="podcast-pacing">${options(PACINGS, dials.pacing)}</select>
    <label for="podcast-interruption">Interruption</label>
    <select id="podcast-interruption">${options(INTERRUPTIONS, dials.interruption)}</select>
  </details>`;
}

function commissionFields(tags: string[]) {
  const tagBoxes = tags.length
    ? `<fieldset class="alchemist__mode"><legend>Tags (optional)</legend>${tags
        .map(
          tag =>
            `<label><input type="checkbox" data-podcast-tag="${escapeHtml(tag)}" ${selectedTags.includes(tag) ? "checked" : ""} /> ${escapeHtml(tag)}</label>`,
        )
        .join(" ")}</fieldset>`
    : "";
  const areaSelect = `<label for="podcast-area">Area</label>
    <select id="podcast-area">
      <option value="all" ${area === "all" ? "selected" : ""}>All</option>
      <option value="university" ${area === "university" ? "selected" : ""}>University</option>
      <option value="notes" ${area === "notes" ? "selected" : ""}>Notes</option>
    </select>`;
  if (kind === "series") {
    return `<label for="podcast-topic">Topic</label>
      <input id="podcast-topic" type="text" value="${escapeHtml(topic)}" required />
      <label for="podcast-run-length">Run length</label>
      <input id="podcast-run-length" type="number" min="4" max="12" value="${runLength}" />
      <label for="podcast-series-cadence">Cadence</label>
      <select id="podcast-series-cadence">${options(CADENCES, seriesCadence)}</select>
      ${areaSelect}
      ${tagBoxes}
      ${advancedHtml()}`;
  }
  return `<fieldset class="alchemist__mode"><legend>Mode</legend>${MODES.map(
    value =>
      `<label><input type="radio" name="podcast-mode" value="${value}" ${mode === value ? "checked" : ""} /> ${escapeHtml(labelize(value))}</label>`,
  ).join(" ")}</fieldset>
    ${modeDialHtml(tags)}
    ${areaSelect}
    ${tagBoxes}
    ${advancedHtml()}`;
}

function currentHtml() {
  if (statusNote && !current) {
    return `<p class="alchemist__mode" aria-live="polite">${escapeHtml(statusNote)}</p>`;
  }
  if (!current) {
    return `<p class="empty">Commission a one-off or a series. Episodes land in the library when they exist.</p>`;
  }
  if ((current.status === "ready" || current.status === "cancelled") && current.turns.length) {
    return playerHtml(current);
  }
  const title = current.showTitle ?? labelize(current.mode);
  const failure = current.status === "error" ? episodeFailure(current) : "";
  return `<article class="coach-msg glass-panel">
    <p class="coach-msg__who">${escapeHtml(title)}</p>
    <p class="alchemist__mode">${escapeHtml(current.status)}${current.episodeIndex ? ` · episode ${current.episodeIndex}` : ""}</p>
    ${failure ? `<p class="alchemist__error">${escapeHtml(failure)}</p>` : ""}
    ${statusNote ? `<p class="alchemist__mode">${escapeHtml(statusNote)}</p>` : ""}
  </article>`;
}

function libraryHtml() {
  if (USE_LOCAL_DATA) {
    return `<p class="empty">Library needs the Netlify API.</p>`;
  }
  const seriesCards = library.series
    .map(series => {
      const recorded = series.slots.filter(slot => slot.episodeId).length;
      const showNext = canNext(series);
      return `<article class="podcast-card glass-panel">
        <h2>${escapeHtml(series.showTitle)}</h2>
        <p class="alchemist__mode">${recorded} / ${series.slots.length}</p>
        ${
          showNext
            ? `<button type="button" data-next-series="${escapeHtml(series.id)}" ${busy ? "disabled" : ""}>Next episode</button>`
            : ""
        }
      </article>`;
    })
    .join("");
  const oneOffs = library.episodes
    .filter(episode => !episode.seriesId)
    .map(
      episode => `<article class="podcast-card glass-panel">
        <button type="button" data-open-episode="${escapeHtml(episode.id)}">${escapeHtml(episode.mode)} · ${escapeHtml(formatDate(episode.created_at))}</button>
      </article>`,
    )
    .join("");
  if (!seriesCards && !oneOffs) {
    return libraryLoading ? `<p class="empty">Loading library…</p>` : `<p class="empty">No episodes yet.</p>`;
  }
  return `${seriesCards}${oneOffs}`;
}

function readDials(root: ParentNode) {
  const value = (id: string) => root.querySelector<HTMLSelectElement>(id)?.value;
  dials = PodcastDialsSchema.parse({
    length: value("#podcast-length") ?? dials.length,
    complexity: value("#podcast-complexity") ?? dials.complexity,
    citationDensity: value("#podcast-citation") ?? dials.citationDensity,
    formality: value("#podcast-formality") ?? dials.formality,
    banter: value("#podcast-banter") ?? dials.banter,
    disagreement: value("#podcast-disagreement") ?? dials.disagreement,
    chicken: Number(value("#podcast-chicken") ?? dials.chicken),
    pacing: value("#podcast-pacing") ?? dials.pacing,
    interruption: value("#podcast-interruption") ?? dials.interruption,
  });
}

function bindForm(host: PodcastRailHost) {
  const root = host.app;
  const form = root.querySelector("form");
  if (!form) return;

  root.querySelectorAll<HTMLInputElement>("input[name='podcast-kind']").forEach(input => {
    input.onchange = () => {
      kind = input.value as Kind;
      host.render();
    };
  });
  root.querySelectorAll<HTMLInputElement>("input[name='podcast-mode']").forEach(input => {
    input.onchange = () => {
      mode = input.value as PodcastMode;
      host.render();
    };
  });

  const cadence = root.querySelector<HTMLSelectElement>("#podcast-cadence");
  if (cadence) cadence.onchange = () => {
    recapCadence = cadence.value as (typeof CADENCES)[number];
  };
  const clusterAEl = root.querySelector<HTMLSelectElement>("#podcast-cluster-a");
  if (clusterAEl) clusterAEl.onchange = () => {
    clusterA = clusterAEl.value;
  };
  const clusterBEl = root.querySelector<HTMLSelectElement>("#podcast-cluster-b");
  if (clusterBEl) clusterBEl.onchange = () => {
    clusterB = clusterBEl.value;
  };
  const positionAEl = root.querySelector<HTMLInputElement>("#podcast-position-a");
  if (positionAEl) positionAEl.oninput = () => {
    positionA = positionAEl.value;
  };
  const positionBEl = root.querySelector<HTMLInputElement>("#podcast-position-b");
  if (positionBEl) positionBEl.oninput = () => {
    positionB = positionBEl.value;
  };
  const topicEl = root.querySelector<HTMLInputElement>("#podcast-topic");
  if (topicEl) topicEl.oninput = () => {
    topic = topicEl.value;
  };
  const runEl = root.querySelector<HTMLInputElement>("#podcast-run-length");
  if (runEl) runEl.oninput = () => {
    runLength = Number(runEl.value);
  };
  const seriesCadenceEl = root.querySelector<HTMLSelectElement>("#podcast-series-cadence");
  if (seriesCadenceEl) seriesCadenceEl.onchange = () => {
    seriesCadence = seriesCadenceEl.value as (typeof CADENCES)[number];
  };
  const areaEl = root.querySelector<HTMLSelectElement>("#podcast-area");
  if (areaEl) areaEl.onchange = () => {
    area = areaEl.value as Area;
  };
  root.querySelectorAll<HTMLInputElement>("[data-podcast-tag]").forEach(box => {
    box.onchange = () => {
      const tag = box.dataset.podcastTag!;
      selectedTags = box.checked ? [...selectedTags, tag] : selectedTags.filter(item => item !== tag);
    };
  });
  const details = root.querySelector<HTMLDetailsElement>(".podcast-advanced");
  if (details) {
    details.ontoggle = () => {
      advancedOpen = details.open;
    };
    details.querySelectorAll("select").forEach(select => {
      select.onchange = () => readDials(root);
    });
  }

  form.onsubmit = event => {
    event.preventDefault();
    void generate(host);
  };
  root.querySelectorAll<HTMLButtonElement>("[data-next-series]").forEach(button => {
    button.onclick = () => void nextEpisode(host, button.dataset.nextSeries!);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-open-episode]").forEach(button => {
    button.onclick = () => openEpisode(host, button.dataset.openEpisode!);
  });
  if (current && (current.status === "ready" || current.status === "cancelled") && current.turns.length) {
    bindPlayer(root, {
      episode: current,
      onOpenPage: host.onOpenPage,
      onEpisode: episode => {
        current = episode;
        if (episode.status === "running") {
          statusNote = runningNote(episode);
          startPoll(host, episode.id);
        }
        host.render();
      },
      onError: message => {
        podcastError = message;
        host.render();
      },
    });
  }
}

function openEpisode(host: PodcastRailHost, id: string) {
  const episode = library.episodes.find(item => item.id === id);
  if (!episode) return;
  stopPoll();
  current = episode;
  resetPlayer();
  podcastError = episode.status === "error" ? episodeFailure(episode) : "";
  statusNote = episode.status === "running" ? runningNote(episode) : "";
  if (episode.status === "running") startPoll(host, episode.id);
  host.render();
}

async function generate(host: PodcastRailHost) {
  if (busy || !canPost()) return;
  stopPoll();
  busy = true;
  podcastError = "";
  current = null;
  resetPlayer();
  statusNote = kind === "series" ? "planning the season" : "recording…";
  host.render();
  try {
    if (kind === "series") {
      const started = await startPodcastSeries({
        topic: topic.trim(),
        scope: scope(),
        episodeCount: runLength,
        cadence: seriesCadence,
        dials,
      });
      current = started.episode;
      library = {
        series: [started.series, ...library.series.filter(item => item.id !== started.series.id)],
        episodes: [started.episode, ...library.episodes.filter(item => item.id !== started.episode.id)],
      };
    } else {
      current = await startPodcast({
        mode,
        scope: scope(),
        modeDial: modeDial(),
        dials,
      });
    }
    if (current.status === "running") {
      statusNote = runningNote(current);
      startPoll(host, current.id);
      host.render();
      return;
    }
    if (current.status === "error") podcastError = episodeFailure(current);
    statusNote = "";
    try {
      await refreshLibrary();
    } catch {
      /* keep the episode we already have */
    }
  } catch (error) {
    podcastError = failMessage(error);
    statusNote = "";
  } finally {
    if (pollTimer === null) busy = false;
    host.render();
  }
}

async function nextEpisode(host: PodcastRailHost, seriesId: string) {
  if (busy) return;
  stopPoll();
  busy = true;
  podcastError = "";
  statusNote = "recording…";
  host.render();
  try {
    current = await nextPodcastEpisode(seriesId);
    if (current.status === "running") {
      startPoll(host, current.id);
      host.render();
      return;
    }
    if (current.status === "error") podcastError = episodeFailure(current);
    statusNote = "";
    try {
      await refreshLibrary();
    } catch {
      /* keep the episode we already have */
    }
  } catch (error) {
    podcastError = failMessage(error);
    statusNote = "";
  } finally {
    if (pollTimer === null) busy = false;
    host.render();
  }
}

export function renderPodcastRail(host: PodcastRailHost) {
  mounted = true;
  ensureLibrary(host);
  host.shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · podcast needs the Netlify API (session). The browser never talks to the research kernel.</p>` : ""}
    <header class="topbar">
      <div>
        <p class="eyebrow">Professor Clementine Haig &amp; Ann O’Tation</p>
        <h1>Podcast</h1>
      </div>
    </header>
    <section class="alchemist podcast">
      <form class="alchemist__form glass-panel">
        <fieldset class="alchemist__mode">
          <legend>Commission</legend>
          <label><input type="radio" name="podcast-kind" value="one-off" ${kind === "one-off" ? "checked" : ""} /> One-off</label>
          <label><input type="radio" name="podcast-kind" value="series" ${kind === "series" ? "checked" : ""} /> Series</label>
        </fieldset>
        ${commissionFields(host.tags)}
        <div class="alchemist__actions">
          <button type="submit" ${busy ? "disabled" : ""}>${busy ? escapeHtml(statusNote || "Working…") : "Generate"}</button>
        </div>
        ${podcastError ? `<p class="alchemist__error">${escapeHtml(podcastError)}</p>` : ""}
      </form>
      <div class="alchemist__results" aria-live="polite">
        ${currentHtml()}
        <section class="podcast-library" aria-label="Library">
          ${libraryHtml()}
        </section>
      </div>
    </section>
  `);
  bindForm(host);
}
