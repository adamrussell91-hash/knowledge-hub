let bound = false;

function syncKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    return;
  }
  const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
  document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
}

export function bindKeyboardInset() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    return;
  }
  viewport.addEventListener("resize", syncKeyboardInset);
  viewport.addEventListener("scroll", syncKeyboardInset);
  syncKeyboardInset();
}
