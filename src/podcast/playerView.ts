import { answerPodcastQuiz, getPodcastAudioUrl, interruptPodcast } from "../api/client";
import { escapeHtml } from "../lib/dom";
import {
  failCurrentLine,
  hasPlayableTurn,
  nextAction,
  pauseAfterInterrupt,
  playerBoxLabel,
  submitQuiz,
  type PlayerState,
} from "./player";
import type { PodcastEpisode, PodcastTurn } from "./schema";

export type PlayerViewHost = {
  episode: PodcastEpisode;
  onOpenPage?: (pageId: string) => void;
  onEpisode?: (episode: PodcastEpisode) => void;
  onError?: (message: string) => void;
};

let episodeId = "";
let state: PlayerState = { playing: false, index: 0 };
let playGen = 0;
let waitingAnswer = false;
let playError = "";
let playInfo = "";

export function resetPlayer() {
  episodeId = "";
  state = { playing: false, index: 0 };
  playGen += 1;
  waitingAnswer = false;
  playError = "";
  playInfo = "";
}

function ensureEpisode(id: string) {
  if (episodeId === id) return;
  episodeId = id;
  state = { playing: false, index: 0 };
  waitingAnswer = false;
  playError = "";
  playInfo = "";
}

function sensitivity(episode: PodcastEpisode) {
  return episode.dials.interruption;
}

function speakerName(turn: PodcastTurn | undefined) {
  if (!turn) return "—";
  if (turn.speaker === "clementine") return "Professor Clementine Haig";
  if (turn.speaker === "ann") return "Ann O’Tation";
  if (turn.kind === "cue") return "Cue";
  return "Hosts";
}

function turnLine(turn: PodcastTurn) {
  if (!turn.audioKey && turn.kind !== "cue" && turn.kind !== "empty") {
    return "couldn’t record this line";
  }
  if (turn.kind === "cue" && !turn.text) return "·";
  return turn.text;
}

function citationsHtml(turn: PodcastTurn | undefined) {
  if (!turn?.citations.length) return `<p class="alchemist__mode">No citations on this line.</p>`;
  return `<div class="podcast-player__citations">${turn.citations
    .map(
      citation =>
        `<button type="button" data-open-page="${escapeHtml(citation.pageId)}">${escapeHtml(citation.title)}</button>`,
    )
    .join("")}</div>`;
}

function transcriptHtml(episode: PodcastEpisode) {
  return `<ol class="podcast-transcript">${episode.turns
    .map((turn, index) => {
      const current = index === state.index ? " is-current" : "";
      return `<li class="${current.trim()}" data-turn-index="${index}">
        <p class="podcast-transcript__who">${escapeHtml(speakerName(turn))}</p>
        <p>${escapeHtml(turnLine(turn))}</p>
      </li>`;
    })
    .join("")}</ol>`;
}

export function nothingToPlayMessage(episode: PodcastEpisode) {
  if (episode.turns.every(turn => turn.kind === "empty")) {
    return "Nothing new in the archive for this window, so there is no audio. Try a longer cadence or a different mode.";
  }
  if (!episode.turns.some(turn => turn.audioKey)) return "This episode has no recorded audio.";
  return "End of the episode.";
}

function waitingNote() {
  if (playError) return `<p class="alchemist__error" data-player-note>${escapeHtml(playError)}</p>`;
  if (playInfo) return `<p class="alchemist__mode" data-player-note>${escapeHtml(playInfo)}</p>`;
  if (waitingAnswer) return `<p class="alchemist__mode" data-player-note>Type an answer to continue.</p>`;
  if (state.pendingInterrupt) return `<p class="alchemist__mode" data-player-note>Finishing this thought…</p>`;
  return `<p class="alchemist__mode" data-player-note hidden></p>`;
}

export function playerHtml(episode: PodcastEpisode) {
  ensureEpisode(episode.id);
  if (!playError && episode.status !== "running" && !hasPlayableTurn(episode.turns)) {
    playInfo = nothingToPlayMessage(episode);
  }
  const turn = episode.turns[state.index];
  const title = episode.episodeIndex ? `Episode ${episode.episodeIndex}` : episode.mode.replace(/-/g, " ");
  const eyebrow = episode.showTitle ?? "Podcast";
  return `<article class="podcast-player glass-panel">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h2>${escapeHtml(title)}</h2>
    <p class="alchemist__mode">${escapeHtml(episode.status)}</p>
    <div class="podcast-player__controls">
      <button type="button" data-player="toggle">${state.playing ? "Pause" : "Play"}</button>
      <button type="button" data-player="skip">Skip cue</button>
    </div>
    <p class="podcast-player__speaker" data-player-speaker>${escapeHtml(speakerName(turn))}</p>
    <div data-player-citations>${citationsHtml(turn)}</div>
    ${waitingNote()}
    <label for="podcast-interrupt" data-interrupt-label>${escapeHtml(playerBoxLabel(waitingAnswer))}</label>
    <textarea id="podcast-interrupt" rows="3" placeholder="Ask from the notes…"></textarea>
    <div class="alchemist__actions">
      <button type="button" data-player="interrupt">Submit</button>
      <button type="button" data-player="skip-quiz"${waitingAnswer ? "" : " hidden"}>Skip</button>
    </div>
    ${transcriptHtml(episode)}
    <audio data-podcast-audio preload="none"></audio>
  </article>`;
}

function bindCitations(root: ParentNode, onOpenPage?: (pageId: string) => void) {
  root.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => onOpenPage?.(button.dataset.openPage!);
  });
}

function patch(root: ParentNode, episode: PodcastEpisode, onOpenPage?: (pageId: string) => void) {
  const turn = episode.turns[state.index];
  const toggle = root.querySelector<HTMLButtonElement>("[data-player='toggle']");
  if (toggle) toggle.textContent = state.playing ? "Pause" : "Play";
  const speaker = root.querySelector("[data-player-speaker]");
  if (speaker) speaker.textContent = speakerName(turn);
  const citations = root.querySelector("[data-player-citations]");
  if (citations) {
    citations.innerHTML = citationsHtml(turn);
    bindCitations(citations, onOpenPage);
  }
  const note = root.querySelector<HTMLElement>("[data-player-note]");
  if (note) {
    note.className = playError ? "alchemist__error" : "alchemist__mode";
    if (playError) {
      note.hidden = false;
      note.textContent = playError;
    } else if (playInfo) {
      note.hidden = false;
      note.textContent = playInfo;
    } else if (waitingAnswer) {
      note.hidden = false;
      note.textContent = "Type an answer to continue.";
    } else if (state.pendingInterrupt) {
      note.hidden = false;
      note.textContent = "Finishing this thought…";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }
  const label = root.querySelector("[data-interrupt-label]");
  if (label) label.textContent = playerBoxLabel(waitingAnswer);
  const skip = root.querySelector<HTMLButtonElement>("[data-player='skip-quiz']");
  if (skip) skip.hidden = !waitingAnswer;
  root.querySelectorAll<HTMLElement>("[data-turn-index]").forEach(item => {
    item.classList.toggle("is-current", Number(item.dataset.turnIndex) === state.index);
  });
}

async function apply(root: ParentNode, host: PlayerViewHost, next: ReturnType<typeof nextAction>) {
  state = next.state;
  const audio = root.querySelector<HTMLAudioElement>("[data-podcast-audio]");
  const turns = host.episode.turns;
  const dial = sensitivity(host.episode);

  if (next.command.type === "wait-answer") waitingAnswer = true;
  else if (next.command.type !== "noop") waitingAnswer = false;
  if (next.command.type === "play-index") {
    playError = "";
    playInfo = "";
  }
  if (next.command.type === "nothing-to-play") {
    playError = "";
    playInfo = nothingToPlayMessage(host.episode);
  }

  patch(root, host.episode, host.onOpenPage);

  if (next.command.type === "pause" || next.command.type === "stop-now" || next.command.type === "wait-answer") {
    playGen += 1;
    audio?.pause();
    if (next.command.type === "stop-now") {
      audio?.removeAttribute("src");
      audio?.load();
      if (state.pendingInterrupt) {
        await apply(root, host, nextAction(state, "ended", turns, dial));
      }
    }
    return;
  }

  if (next.command.type === "play-index") {
    const turn = turns[next.command.index];
    if (!turn?.audioKey) {
      if (host.episode.status === "running") {
        playInfo = "Still recording this line…";
        patch(root, host.episode, host.onOpenPage);
        return;
      }
      stayOnFailedLine(root, host, "couldn’t record this line");
      return;
    }
    const gen = ++playGen;
    try {
      const { url } = await getPodcastAudioUrl(host.episode.id, turn.id);
      if (gen !== playGen || !audio) return;
      audio.src = url;
      await audio.play();
    } catch {
      if (gen !== playGen) return;
      stayOnFailedLine(root, host, "couldn’t play this line");
    }
    return;
  }

  if (next.command.type === "submit-interrupt") {
    playGen += 1;
    audio?.pause();
    const afterTurn = turns[state.index]?.id;
    if (!afterTurn) return;
    try {
      const episode = await interruptPodcast(host.episode.id, {
        afterTurn,
        question: next.command.question,
      });
      state = pauseAfterInterrupt(state);
      host.onEpisode?.(episode);
    } catch (error) {
      host.onError?.(error instanceof Error ? error.message : "Podcast failed.");
    }
  }
}

async function submitFollowup(
  root: ParentNode,
  host: PlayerViewHost,
  payload: ReturnType<typeof submitQuiz>,
) {
  if (payload.type === "noop") return;
  if (payload.type === "answer") {
    try {
      const episode = await answerPodcastQuiz(host.episode.id, {
        afterTurn: payload.afterTurn,
        text: payload.text,
      });
      waitingAnswer = false;
      state = pauseAfterInterrupt(state);
      host.onEpisode?.(episode);
    } catch (error) {
      host.onError?.(error instanceof Error ? error.message : "Podcast failed.");
    }
    return;
  }
  void apply(
    root,
    host,
    nextAction(state, "interrupt", host.episode.turns, sensitivity(host.episode), payload.question),
  );
}

function stayOnFailedLine(root: ParentNode, host: PlayerViewHost, message: string) {
  playGen += 1;
  playError = message;
  playInfo = "";
  state = failCurrentLine(state);
  const audio = root.querySelector<HTMLAudioElement>("[data-podcast-audio]");
  audio?.pause();
  patch(root, host.episode, host.onOpenPage);
}

export function bindPlayer(root: ParentNode, host: PlayerViewHost) {
  ensureEpisode(host.episode.id);
  const article = root.querySelector(".podcast-player");
  if (!article) return;

  const turns = host.episode.turns;
  const dial = sensitivity(host.episode);
  const audio = article.querySelector<HTMLAudioElement>("[data-podcast-audio]");
  if (audio) {
    audio.onended = () => {
      void apply(article, host, nextAction(state, "ended", turns, dial));
    };
  }

  article.querySelector<HTMLButtonElement>("[data-player='toggle']")!.onclick = () => {
    void apply(article, host, nextAction(state, state.playing ? "pause" : "play", turns, dial));
  };
  article.querySelector<HTMLButtonElement>("[data-player='skip']")!.onclick = () => {
    playGen += 1;
    audio?.pause();
    void apply(
      article,
      host,
      nextAction({ ...state, playing: false, index: state.index + 1 }, "play", turns, dial),
    );
  };
  article.querySelector<HTMLButtonElement>("[data-player='interrupt']")!.onclick = () => {
    const box = article.querySelector<HTMLTextAreaElement>("#podcast-interrupt");
    const afterTurn = turns[state.index]?.id ?? "";
    void submitFollowup(
      article,
      host,
      submitQuiz({ waitingAnswer, afterTurn, text: box?.value ?? "" }),
    );
  };
  const skipQuiz = article.querySelector<HTMLButtonElement>("[data-player='skip-quiz']");
  if (skipQuiz) {
    skipQuiz.onclick = () => {
      const afterTurn = turns[state.index]?.id ?? "";
      void submitFollowup(article, host, submitQuiz({ waitingAnswer: true, afterTurn, text: "", skip: true }));
    };
  }
  bindCitations(article, host.onOpenPage);

  if (state.playing) {
    state = { ...state, playing: false };
    void apply(article, host, nextAction(state, "play", turns, dial));
  }
}
