import { escapeHtml } from "../lib/dom";
import { scoreBlueGaps, type DumpEdge, type DumpNode } from "./dumpSort";

export function mountDumpSort(
  host: HTMLElement,
  options: {
    topic: string;
    peek?: DumpNode[];
    sortThenDump?: boolean;
    onSave: (payload: { nodes: DumpNode[]; edges: DumpEdge[] }) => void;
    onCancel: () => void;
  },
) {
  let phase = 0;
  let maxPhase = 0;
  let connectMode = false;
  let connectFrom: string | null = null;
  let timerMins = 10;
  let remaining = 600;
  let timer: number | null = null;
  let dragging: { id: string; dx: number; dy: number } | null = null;
  let seq = 1;
  const nodes: DumpNode[] = [{ id: "center", x: 50, y: 50, text: options.topic, type: "center" }];
  const edges: DumpEdge[] = [];

  host.innerHTML = `<div class="dump-shell">
    <div class="dump-tabs" role="tablist">
      <button type="button" data-dump-tab="0"><span>01</span> Dump</button>
      <button type="button" data-dump-tab="1"><span>02</span> Check</button>
      <button type="button" data-dump-tab="2"><span>03</span> Connect</button>
      <button type="button" data-dump-tab="3"><span>04</span> Priorities</button>
    </div>
    <div class="dump-stage">
      <svg class="dump-svg" aria-hidden="true"></svg>
      <div class="dump-map"></div>
      <div class="dump-peek" hidden></div>
      <p class="dump-hint" hidden>Click a node to start a connection</p>
      <aside class="dump-report" hidden></aside>
    </div>
    <div class="dump-bar">
      <span class="dump-bar__phase">Phase 1 — Dump</span>
      <div class="dump-timer">
        <button type="button" data-dump-nudge="-1">−</button>
        <span data-dump-clock>10:00</span>
        <button type="button" data-dump-nudge="1">+</button>
        <button type="button" data-dump-timer>Start</button>
      </div>
      <button type="button" data-dump-connect hidden>Connect nodes</button>
      <button type="button" data-dump-back hidden>Back</button>
      <button type="button" data-dump-next>Done — Check →</button>
      <button type="button" data-dump-hide hidden>Hide and dump</button>
      <button type="button" data-dump-save hidden>Save to map</button>
      <button type="button" data-dump-cancel>Cancel</button>
    </div>
  </div>`;

  const map = host.querySelector<HTMLElement>(".dump-map")!;
  const svg = host.querySelector<SVGSVGElement>(".dump-svg")!;
  const hint = host.querySelector<HTMLElement>(".dump-hint")!;
  const report = host.querySelector<HTMLElement>(".dump-report")!;
  const clock = host.querySelector("[data-dump-clock]")!;
  const timerBtn = host.querySelector<HTMLButtonElement>("[data-dump-timer]")!;
  const connectBtn = host.querySelector<HTMLButtonElement>("[data-dump-connect]")!;
  const nextBtn = host.querySelector<HTMLButtonElement>("[data-dump-next]")!;
  const backBtn = host.querySelector<HTMLButtonElement>("[data-dump-back]")!;
  const saveBtn = host.querySelector<HTMLButtonElement>("[data-dump-save]")!;
  const hideBtn = host.querySelector<HTMLButtonElement>("[data-dump-hide]")!;
  const peekLayer = host.querySelector<HTMLElement>(".dump-peek")!;
  const phaseLabel = host.querySelector(".dump-bar__phase")!;
  let peeking = Boolean(options.sortThenDump && options.peek?.length);

  function renderPeek() {
    peekLayer.hidden = !peeking;
    hideBtn.hidden = !peeking || phase !== 0;
    peekLayer.innerHTML = peeking
      ? (options.peek ?? [])
          .filter(node => node.type !== "center")
          .map(
            node =>
              `<div class="dump-node dump-node--${node.type} dump-node--peek" style="left:${node.x}%;top:${node.y}%">${escapeHtml(node.text)}</div>`,
          )
          .join("")
      : "";
  }

  function fmt(seconds: number) {
    const mins = Math.floor(Math.max(0, seconds) / 60);
    const secs = Math.max(0, seconds) % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    timerBtn.textContent = "Start";
  }

  function renderNodes() {
    map.innerHTML = nodes
      .map(
        node =>
          `<div class="dump-node dump-node--${node.type}" data-dump-node="${escapeHtml(node.id)}" style="left:${node.x}%;top:${node.y}%">${escapeHtml(node.text)}</div>`,
      )
      .join("");
    bindNodes();
    drawEdges();
  }

  function drawEdges() {
    const rect = map.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    svg.innerHTML = edges
      .map(edge => {
        const a = nodes.find(node => node.id === edge.from);
        const b = nodes.find(node => node.id === edge.to);
        if (!a || !b) return "";
        const x1 = (a.x / 100) * rect.width;
        const y1 = (a.y / 100) * rect.height;
        const x2 = (b.x / 100) * rect.width;
        const y2 = (b.y / 100) * rect.height;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1a1a18" stroke-width="1.5" />`;
      })
      .join("");
  }

  function bindNodes() {
    map.querySelectorAll<HTMLElement>("[data-dump-node]").forEach(el => {
      const id = el.dataset.dumpNode!;
      const node = nodes.find(item => item.id === id)!;
      el.addEventListener("dblclick", event => {
        event.stopPropagation();
        if (node.type === "center") return;
        const next = window.prompt("Node text", node.text);
        if (next && next.trim()) {
          node.text = next.trim();
          renderNodes();
        }
      });
      el.addEventListener("click", event => {
        event.stopPropagation();
        if (!connectMode || node.type === "center") return;
        if (!connectFrom) {
          connectFrom = id;
          el.classList.add("is-selected");
          hint.textContent = "Now click a second node to connect";
          return;
        }
        if (connectFrom === id) {
          connectFrom = null;
          el.classList.remove("is-selected");
          hint.textContent = "Click a node to start a connection";
          return;
        }
        if (!edges.some(edge => (edge.from === connectFrom && edge.to === id) || (edge.from === id && edge.to === connectFrom))) {
          edges.push({ from: connectFrom, to: id });
        }
        connectFrom = null;
        hint.textContent = "Click a node to start a connection";
        renderNodes();
      });
      el.addEventListener("pointerdown", event => {
        if (connectMode || node.type === "center") return;
        const rect = map.getBoundingClientRect();
        dragging = {
          id,
          dx: ((event.clientX - rect.left) / rect.width) * 100 - node.x,
          dy: ((event.clientY - rect.top) / rect.height) * 100 - node.y,
        };
        el.setPointerCapture(event.pointerId);
      });
      el.addEventListener("pointermove", event => {
        if (!dragging || dragging.id !== id) return;
        const rect = map.getBoundingClientRect();
        node.x = Math.min(96, Math.max(4, ((event.clientX - rect.left) / rect.width) * 100 - dragging.dx));
        node.y = Math.min(96, Math.max(4, ((event.clientY - rect.top) / rect.height) * 100 - dragging.dy));
        el.style.left = `${node.x}%`;
        el.style.top = `${node.y}%`;
        drawEdges();
      });
      el.addEventListener("pointerup", () => {
        dragging = null;
      });
    });
  }

  function setPhase(next: number) {
    if (next > maxPhase) return;
    phase = next;
    connectMode = phase === 2;
    connectFrom = null;
    hint.hidden = phase !== 2;
    report.hidden = phase !== 3;
    host.querySelector(".dump-stage")?.classList.toggle("is-connect", connectMode);
    host.querySelectorAll<HTMLButtonElement>("[data-dump-tab]").forEach(tab => {
      const index = Number(tab.dataset.dumpTab);
      tab.classList.toggle("is-active", index === phase);
      tab.classList.toggle("is-unlocked", index <= maxPhase && index !== phase);
    });
    const labels = ["Phase 1 — Dump", "Phase 2 — Check", "Phase 3 — Connect", "Phase 4 — Priorities"];
    phaseLabel.textContent = labels[phase];
    connectBtn.hidden = phase !== 2;
    saveBtn.hidden = phase !== 3;
    nextBtn.hidden = phase === 3;
    backBtn.hidden = phase === 0;
    hideBtn.hidden = !peeking || phase !== 0;
    nextBtn.textContent = phase === 0 ? "Done — Check →" : phase === 1 ? "Done — Connect →" : "Done — Priorities →";
    if (phase === 3) {
      const ranked = scoreBlueGaps(nodes, edges);
      report.hidden = false;
      report.innerHTML = ranked.length
        ? `<h2>Priorities</h2>${ranked
            .map(
              item =>
                `<article><p class="dump-report__rank">Study ${item.rank}</p><h3>${escapeHtml(item.text)}</h3><p>${escapeHtml(item.guidance)}</p></article>`,
            )
            .join("")}`
        : `<h2>Priorities</h2><p>No blue gaps yet. Go back to Check and add what you missed.</p>`;
    }
    if (phase !== 0) peeking = false;
    renderNodes();
    renderPeek();
  }

  hideBtn.onclick = () => {
    peeking = false;
    renderPeek();
  };
  map.addEventListener("click", event => {
    if (event.target !== map || phase > 1 || peeking) return;
    const rect = map.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    nodes.push({
      id: `n${seq++}`,
      x,
      y,
      text: phase === 1 ? "Gap" : "Idea",
      type: phase === 1 ? "blue" : "black",
    });
    renderNodes();
  });

  host.querySelectorAll<HTMLButtonElement>("[data-dump-tab]").forEach(tab => {
    tab.onclick = () => setPhase(Number(tab.dataset.dumpTab));
  });
  host.querySelectorAll<HTMLButtonElement>("[data-dump-nudge]").forEach(button => {
    button.onclick = () => {
      if (timer !== null) return;
      timerMins = Math.max(1, timerMins + Number(button.dataset.dumpNudge));
      remaining = timerMins * 60;
      clock.textContent = fmt(remaining);
    };
  });
  timerBtn.onclick = () => {
    if (timer !== null) {
      stopTimer();
      return;
    }
    if (remaining <= 0) remaining = timerMins * 60;
    timerBtn.textContent = "Pause";
    timer = window.setInterval(() => {
      remaining -= 1;
      clock.textContent = fmt(remaining);
      if (remaining <= 0) stopTimer();
    }, 1000);
  };
  connectBtn.onclick = () => {
    connectMode = !connectMode;
    hint.hidden = !connectMode;
    host.querySelector(".dump-stage")?.classList.toggle("is-connect", connectMode);
    connectBtn.textContent = connectMode ? "Stop connecting" : "Connect nodes";
  };
  nextBtn.onclick = () => {
    maxPhase = Math.max(maxPhase, phase + 1);
    setPhase(phase + 1);
  };
  backBtn.onclick = () => setPhase(phase - 1);
  saveBtn.onclick = () => options.onSave({ nodes: nodes.map(node => ({ ...node })), edges: edges.map(edge => ({ ...edge })) });
  host.querySelector<HTMLButtonElement>("[data-dump-cancel]")!.onclick = options.onCancel;

  setPhase(0);
  return () => {
    stopTimer();
    host.innerHTML = "";
  };
}
