export const UNIVERSE_DARK_KEY = "kh-universe-dark";

export function readUniverseDark(storage: Pick<Storage, "getItem"> | null | undefined) {
  try {
    return storage?.getItem(UNIVERSE_DARK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeUniverseDark(on: boolean, storage: Pick<Storage, "setItem"> | null | undefined) {
  try {
    storage?.setItem(UNIVERSE_DARK_KEY, on ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

export function universeWrapClass(dark: boolean, fullscreen: boolean) {
  return `graph-wrap${dark ? " is-universe-dark" : ""}${fullscreen ? " is-universe-fullscreen" : ""}`;
}

export function universeViewToolsHtml(dark: boolean, fullscreen: boolean) {
  return `<div class="universe-view-tools graph-modes" role="group" aria-label="Universe view">
    <button type="button" data-universe-dark aria-pressed="${dark}" class="${dark ? "is-active" : ""}">${dark ? "Light" : "Dark"}</button>
    <button type="button" data-universe-fullscreen aria-pressed="${fullscreen}" class="${fullscreen ? "is-active" : ""}">${fullscreen ? "Exit" : "Full screen"}</button>
  </div>`;
}

export function graphFullscreenToolsHtml(fullscreen: boolean) {
  return `<div class="universe-view-tools graph-modes" role="group" aria-label="Graph view">
    <button type="button" data-universe-fullscreen aria-pressed="${fullscreen}" class="${fullscreen ? "is-active" : ""}">${fullscreen ? "Exit" : "Full screen"}</button>
  </div>`;
}

export function universeExitHtml(fullscreen: boolean) {
  return `<button type="button" class="universe-exit btn btn--ghost" data-universe-exit${fullscreen ? "" : " hidden"}>Exit full screen</button>`;
}

export function syncUniverseViewButtons(root: ParentNode, dark: boolean, fullscreen: boolean) {
  const darkBtn = root.querySelector<HTMLButtonElement>("[data-universe-dark]");
  if (darkBtn) {
    darkBtn.classList.toggle("is-active", dark);
    darkBtn.setAttribute("aria-pressed", String(dark));
    darkBtn.textContent = dark ? "Light" : "Dark";
  }
  const fullBtn = root.querySelector<HTMLButtonElement>("[data-universe-fullscreen]");
  if (fullBtn) {
    fullBtn.classList.toggle("is-active", fullscreen);
    fullBtn.setAttribute("aria-pressed", String(fullscreen));
    fullBtn.textContent = fullscreen ? "Exit" : "Full screen";
  }
  const exit = root.querySelector<HTMLButtonElement>("[data-universe-exit]");
  if (exit) exit.hidden = !fullscreen;
}

export function applyUniverseViewState(
  wrap: HTMLElement,
  body: HTMLElement,
  dark: boolean,
  fullscreen: boolean,
) {
  wrap.classList.toggle("is-universe-dark", dark);
  wrap.classList.toggle("is-universe-fullscreen", fullscreen);
  body.classList.toggle("is-universe-fullscreen", fullscreen);
  syncUniverseViewButtons(wrap, dark, fullscreen);
}

export function shouldExitUniverseFullscreen(key: string, fullscreen: boolean) {
  return key === "Escape" && fullscreen;
}

export function bindUniverseView(
  root: ParentNode,
  options: {
    getDark: () => boolean;
    getFullscreen: () => boolean;
    setDark: (on: boolean) => void;
    setFullscreen: (on: boolean) => void;
  },
) {
  const darkBtn = root.querySelector<HTMLButtonElement>("[data-universe-dark]");
  const fullBtn = root.querySelector<HTMLButtonElement>("[data-universe-fullscreen]");
  const exit = root.querySelector<HTMLButtonElement>("[data-universe-exit]");
  if (darkBtn) {
    darkBtn.onclick = () => options.setDark(!options.getDark());
  }
  if (fullBtn) {
    fullBtn.onclick = () => options.setFullscreen(!options.getFullscreen());
  }
  if (exit) {
    exit.onclick = () => options.setFullscreen(false);
  }
}
