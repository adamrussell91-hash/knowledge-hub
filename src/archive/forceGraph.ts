import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import {
  OVERLAP_LINK_ALPHA,
  attachGraphSearch,
  canvasRadius,
  initialForceView,
  linkDrawState,
  nodeDrawState,
  nodeHoverTip,
  resolveBackgroundClick,
  resolveEnterKey,
  resolveNodeClick,
  showAllLinkShouldDraw,
  shouldLockShowAll,
  simulationNodes,
  type ForceGraphVariant,
  type GraphMount,
} from "./forceGraphBehavior";
import type { ArchiveGraphModel, GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import { createShowAllSimulation, lockShowAllNodes } from "./showAllSimulation";

export type { ForceGraphVariant };

export type ForceGraphHandlers = {
  onNoteSelect?: (note: { pageId: string; title: string; excerpt: string } | null) => void;
};

export type ForceGraphOptions = {
  variant: ForceGraphVariant;
  search: string;
  excerptFor: (pageId: string) => string;
};

function curve(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = Math.min(120, dist * 0.22);
  const cx = mx - (dy / dist) * bend;
  const cy = my + (dx / dist) * bend;
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
}

function linkEnds(link: GraphLinkDatum, map: Map<string, GraphNodeDatum>) {
  const source = typeof link.source === "string" ? map.get(link.source) : link.source;
  const target = typeof link.target === "string" ? map.get(link.target) : link.target;
  return { source, target };
}

export function mountForceGraph(
  host: HTMLElement,
  model: ArchiveGraphModel,
  handlers: ForceGraphHandlers,
  options: ForceGraphOptions = { variant: "constellation", search: "", excerptFor: () => "" },
): GraphMount {
  const width = host.clientWidth || 1100;
  const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
  host.innerHTML = "";
  host.style.height = `${height}px`;
  const onNoteSelect = handlers.onNoteSelect ?? (() => {});

  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas";
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.appendChild(canvas);

  const tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.hidden = true;
  host.appendChild(tip);

  const ctx = canvas.getContext("2d")!;
  const anchor = model.nodes.find(node => node.kind === "major" && node.x != null && node.y != null);
  const view = initialForceView(options.variant, width, height, {
    x: options.variant === "showAll" ? 760 : (anchor?.x ?? 760),
    y: options.variant === "showAll" ? 560 : (anchor?.y ?? 560),
  });

  let hover: GraphNodeDatum | null = null;
  let selected: string | null = null;
  let dragged: GraphNodeDatum | null = null;

  let simNodes: GraphNodeDatum[] = model.nodes.map(node => ({ ...node }));
  let simLinks: GraphLinkDatum[] = model.links.map(link => ({ ...link }));
  let nodeMap = new Map(simNodes.map(node => [node.id, node]));
  let maxWeight = 1;
  for (const link of simLinks) if (link.weight > maxWeight) maxWeight = link.weight;
  let drawRaf = 0;
  let simulation: Simulation<GraphNodeDatum, GraphLinkDatum> = createSimulation();

  function refreshLookups() {
    nodeMap = new Map(simNodes.map(node => [node.id, node]));
    maxWeight = 1;
    for (const link of simLinks) if (link.weight > maxWeight) maxWeight = link.weight;
  }

  function scheduleDraw() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(() => {
      drawRaf = 0;
      draw();
    });
  }

  function onScreen(x: number, y: number, pad = 64) {
    const sx = view.x + x * view.k;
    const sy = view.y + y * view.k;
    return sx >= -pad && sy >= -pad && sx <= width + pad && sy <= height + pad;
  }

  function createSimulation() {
    const nodesForSim = simulationNodes(options.variant, simNodes);
    if (options.variant === "showAll") {
      let ticks = 0;
      const sim = createShowAllSimulation(nodesForSim, simLinks)
        .on("tick", () => {
          ticks += 1;
          if (shouldLockShowAll(ticks)) {
            lockShowAllNodes(simNodes);
            sim.stop();
          }
          scheduleDraw();
        });
      return sim;
    }
    const sim = forceSimulation(nodesForSim)
      .force(
        "link",
        forceLink<GraphNodeDatum, GraphLinkDatum>(simLinks)
          .id(node => node.id)
          .distance(link => {
            if (link.kind === "spoke") return 72;
            if (link.kind === "orbit") return 140;
            return 240 + Math.min(140, link.weight / 5);
          })
          .strength(link => {
            if (link.kind === "spoke") return 0.65;
            if (link.kind === "orbit") return 0.35;
            return 0.04;
          }),
      )
      .force(
        "charge",
        forceManyBody<GraphNodeDatum>()
          .strength(node => {
            if (node.kind === "leaf") return 0;
            if (node.kind === "major") return -2400;
            if (node.kind === "minor") return -320;
            return -28;
          })
          .distanceMax(1200),
      )
      .force(
        "x",
        forceX<GraphNodeDatum>(node => node.x ?? 760).strength(node => {
          if (node.kind === "leaf") return 0;
          if (node.kind === "major") return 0.12;
          if (node.kind === "minor") return 0.06;
          return 0.02;
        }),
      )
      .force(
        "y",
        forceY<GraphNodeDatum>(node => node.y ?? 560).strength(node => {
          if (node.kind === "leaf") return 0;
          if (node.kind === "major") return 0.12;
          if (node.kind === "minor") return 0.06;
          return 0.02;
        }),
      )
      .force(
        "collide",
        forceCollide<GraphNodeDatum>()
          .radius(node => {
            if (node.kind === "leaf") return 0;
            if (node.kind === "major") return node.r + 44;
            if (node.kind === "minor") return node.r + 18;
            return node.r + 8;
          })
          .strength(0.95),
      )
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on("tick", scheduleDraw);

    return sim;
  }

  function restartSimulation() {
    simulation.stop();
    simulation = createSimulation();
  }

  function byId() {
    return nodeMap;
  }

  function collapseLeaves() {
    const liveById = byId();
    simNodes = model.nodes.map(node => {
      const live = liveById.get(node.id);
      return {
        ...node,
        expanded: false,
        x: live?.x ?? node.x,
        y: live?.y ?? node.y,
      };
    });
    simLinks = model.links.map(link => ({ ...link }));
    refreshLookups();
  }

  function expandMinor(label: string) {
    const hub = simNodes.find(node => node.kind === "minor" && node.label === label);
    if (!hub) return;
    const wasExpanded = hub.expanded;
    collapseLeaves();
    const nextHub = simNodes.find(node => node.kind === "minor" && node.label === label)!;
    if (wasExpanded) {
      selected = null;
      restartSimulation();
      return;
    }
    nextHub.expanded = true;
    selected = label;
    const notes = model.leaves.get(label) ?? [];
    if (!notes.length || nextHub.x == null || nextHub.y == null) {
      restartSimulation();
      return;
    }

    const leaves: GraphNodeDatum[] = [];
    const spokes: GraphLinkDatum[] = [];
    const radius = 96 + notes.length * 3;
    notes.forEach((note, index) => {
      const angle = (Math.PI * 2 * index) / notes.length - Math.PI / 2;
      const node: GraphNodeDatum = {
        id: `leaf:${note.id}`,
        kind: "leaf",
        label: note.title,
        count: 1,
        pageId: note.id,
        parentKeyword: label,
        color: nextHub.color,
        soft: nextHub.soft,
        ink: nextHub.ink,
        r: 6,
        x: nextHub.x! + Math.cos(angle) * radius,
        y: nextHub.y! + Math.sin(angle) * radius,
      };
      leaves.push(node);
      spokes.push({
        source: nextHub.id,
        target: node.id,
        kind: "spoke",
        weight: 1,
        color: nextHub.color,
      });
    });

    simNodes = [...simNodes, ...leaves];
    simLinks = [...simLinks, ...spokes];
    refreshLookups();
    restartSimulation();
  }

  function focusMajor(label: string) {
    selected = selected === label ? null : label;
    collapseLeaves();
    const major = simNodes.find(node => node.kind === "major" && node.label === label);
    if (major) major.expanded = selected === label;
    restartSimulation();
  }

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  };

  const findNode = (x: number, y: number) => {
    let hit: GraphNodeDatum | null = null;
    let best = Infinity;
    const skipLeaves = options.variant === "showAll" && view.k < 0.11;
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const node = simNodes[i];
      if (skipLeaves && node.kind === "leaf") continue;
      const dx = (node.x ?? 0) - x;
      const dy = (node.y ?? 0) - y;
      const dist = Math.hypot(dx, dy);
      const minPx = node.kind === "major" ? 6 : node.kind === "minor" ? 4 : 2.4;
      const hitR = canvasRadius(node.r, view.k, options.variant === "showAll" ? minPx : 1.6);
      const pad = node.kind === "major" ? 8 : node.kind === "minor" ? 6 : 4;
      if (dist <= hitR + pad && dist < best) {
        best = dist;
        hit = node;
      }
    }
    return hit;
  };

  function drawArgs() {
    return { query: options.search, nodes: simNodes, selected, hover };
  }

  function draw() {
    const map = byId();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    const emphasis = drawArgs();
    const showAll = options.variant === "showAll";
    const showLeaves = !showAll || view.k >= 0.11;

    for (const link of simLinks) {
      const { source, target } = linkEnds(link, map);
      if (!source || !target || source.x == null || target.x == null || source.y == null || target.y == null) continue;
      const leaf = source.kind === "leaf" ? source : target.kind === "leaf" ? target : null;
      const leafOnScreen = Boolean(leaf && onScreen(leaf.x ?? 0, leaf.y ?? 0));
      if (showAll && !showAllLinkShouldDraw(link.kind, view.k, leafOnScreen)) continue;
      if (showAll && link.kind !== "spoke" && !onScreen(source.x, source.y) && !onScreen(target.x, target.y)) continue;

      const { active, dim } = linkDrawState(link, source, target, emphasis);

      ctx.beginPath();
      if (showAll && link.kind === "spoke") {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      } else {
        curve(ctx, source.x, source.y, target.x, target.y);
      }

      if (link.kind === "spoke") {
        ctx.setLineDash([4 / view.k, 5 / view.k]);
        ctx.strokeStyle = active ? "#e07a2f" : link.color;
        ctx.globalAlpha = dim ? 0.08 : active ? 0.75 : 0.4;
        ctx.lineWidth = 1.1 / view.k;
      } else if (link.kind === "orbit") {
        ctx.setLineDash([3 / view.k, 6 / view.k]);
        ctx.strokeStyle = active ? "#e07a2f" : link.color;
        ctx.globalAlpha = dim ? 0.06 : active ? 0.7 : 0.28;
        ctx.lineWidth = 1.4 / view.k;
      } else {
        ctx.setLineDash([]);
        const thick =
          showAll && link.kind === "overlap"
            ? 0.75 + (link.weight / maxWeight) * 1.5
            : 1 + (link.weight / maxWeight) * 4.5;
        if (active) {
          ctx.strokeStyle = "#e07a2f";
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = (thick + 1.4) / view.k;
        } else {
          ctx.strokeStyle = link.color;
          ctx.globalAlpha = dim ? 0.05 : link.kind === "overlap" ? OVERLAP_LINK_ALPHA : 0.2;
          ctx.lineWidth = thick / view.k;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (const node of simNodes) {
      if (node.kind !== "leaf" || node.x == null || node.y == null) continue;
      if (!showLeaves) continue;
      if (options.variant === "showAll" && !onScreen(node.x, node.y)) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      const drawR = canvasRadius(node.r, view.k, options.variant === "showAll" ? 2.4 : 1.6);
      ctx.beginPath();
      ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = dim ? 0.18 : hot ? 1 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1 / view.k;
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      if (view.k > 0.85 && hover === node) {
        ctx.fillStyle = node.ink;
        ctx.font = `500 ${Math.max(10, 11 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const text = node.label.length > 32 ? `${node.label.slice(0, 31)}…` : node.label;
        ctx.fillText(text, node.x + drawR + 6, node.y);
      }
    }

    for (const node of simNodes) {
      if (node.kind !== "minor" || node.x == null || node.y == null) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      const drawR = canvasRadius(node.r, view.k, options.variant === "showAll" ? 4 : 2.8);
      ctx.beginPath();
      ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = dim ? 0.25 : hot ? 1 : 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = (hot ? 2.4 : 1.2) / view.k;
      ctx.strokeStyle = hot ? "#e07a2f" : "#fff";
      ctx.stroke();

      ctx.strokeStyle = node.ink;
      ctx.lineWidth = 1.4 / view.k;
      ctx.beginPath();
      if (node.expanded) {
        ctx.moveTo(node.x - 3.5, node.y);
        ctx.lineTo(node.x + 3.5, node.y);
      } else {
        ctx.moveTo(node.x - 3.5, node.y);
        ctx.lineTo(node.x + 3.5, node.y);
        ctx.moveTo(node.x, node.y - 3.5);
        ctx.lineTo(node.x, node.y + 3.5);
      }
      ctx.stroke();

      if (view.k > 0.55 || hot) {
        ctx.fillStyle = dim ? "rgba(19, 35, 58, 0.35)" : node.ink;
        ctx.font = `600 ${Math.max(11, 12 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const text = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;
        ctx.fillText(text, node.x + node.r + 7, node.y);
      }
    }

    for (const node of simNodes) {
      if (node.kind !== "major" || node.x == null || node.y == null) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(
        node.x - node.r * 0.3,
        node.y - node.r * 0.3,
        4,
        node.x,
        node.y,
        node.r,
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.45, node.soft);
      gradient.addColorStop(1, node.color);
      ctx.globalAlpha = dim ? 0.28 : 1;
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = (hot ? 3 : 1.6) / view.k;
      ctx.strokeStyle = hot ? "#e07a2f" : node.ink;
      ctx.stroke();

      ctx.fillStyle = node.ink;
      ctx.font = `700 ${Math.max(14, 16 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillText(hot ? "●" : "+", node.x, node.y + 1);

      if (view.k > 0.4) {
        ctx.font = `600 ${Math.max(12, 14 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(node.label, node.x, node.y + node.r + 10);
        ctx.font = `500 ${Math.max(10, 11 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.fillStyle = dim ? "rgba(19, 35, 58, 0.28)" : "rgba(19, 35, 58, 0.62)";
        ctx.fillText(`${node.count} notes`, node.x, node.y + node.r + 28);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const world = toWorld(event.clientX, event.clientY);
      const minK = options.variant === "showAll" ? 0.05 : 0.28;
      const next = Math.min(2.4, Math.max(minK, view.k * (event.deltaY < 0 ? 1.08 : 0.92)));
      view.x = event.clientX - canvas.getBoundingClientRect().left - world.x * next;
      view.y = event.clientY - canvas.getBoundingClientRect().top - world.y * next;
      view.k = next;
      scheduleDraw();
    },
    { passive: false },
  );

  canvas.addEventListener("pointerdown", event => {
    const world = toWorld(event.clientX, event.clientY);
    const node = findNode(world.x, world.y);
    if (node) {
      dragged = node;
      node.fx = node.x;
      node.fy = node.y;
      if (options.variant !== "showAll") simulation.alphaTarget(0.15).restart();
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...view };
    const onMove = (move: PointerEvent) => {
      view.x = origin.x + (move.clientX - startX);
      view.y = origin.y + (move.clientY - startY);
      scheduleDraw();
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (resolveBackgroundClick(Math.hypot(up.clientX - startX, up.clientY - startY)) === "clear") {
        selected = null;
        onNoteSelect(null);
        scheduleDraw();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  canvas.addEventListener("pointermove", event => {
    const world = toWorld(event.clientX, event.clientY);
    if (dragged) {
      dragged.x = world.x;
      dragged.y = world.y;
      dragged.fx = world.x;
      dragged.fy = world.y;
      scheduleDraw();
      return;
    }
    const node = findNode(world.x, world.y);
    const hoverChanged = hover !== node;
    hover = node;
    canvas.style.cursor = node ? "pointer" : "grab";
    if (node) {
      tip.hidden = false;
      tip.textContent = nodeHoverTip(node);
      tip.style.left = `${event.clientX - host.getBoundingClientRect().left + 12}px`;
      tip.style.top = `${event.clientY - host.getBoundingClientRect().top + 12}px`;
    } else {
      tip.hidden = true;
    }
    if (hoverChanged) scheduleDraw();
  });

  canvas.addEventListener("pointerup", event => {
    if (!dragged) return;
    const node = dragged;
    dragged = null;
    if (options.variant === "showAll") {
      node.fx = node.x ?? 0;
      node.fy = node.y ?? 0;
    } else {
      node.fx = null;
      node.fy = null;
    }
    if (options.variant !== "showAll") simulation.alphaTarget(0);
    const world = toWorld(event.clientX, event.clientY);
    const still = findNode(world.x, world.y);
    if (!(still && still.id === node.id)) return;
    if (event.detail >= 2 && (node.kind === "major" || node.kind === "minor")) return;

    const action = resolveNodeClick(options.variant, node, selected, options.excerptFor);
    if (action.kind === "focusMajor") {
      onNoteSelect(null);
      focusMajor(action.label);
      return;
    }
    if (action.kind === "expandMinor") {
      onNoteSelect(null);
      expandMinor(action.label);
      return;
    }
    if (action.kind === "selectHub") {
      selected = action.selected;
      onNoteSelect(null);
      scheduleDraw();
      return;
    }
    if (action.kind === "selectNote") {
      selected = action.selected;
      onNoteSelect(action.note);
      scheduleDraw();
    }
  });

  canvas.addEventListener("pointerleave", () => {
    hover = null;
    tip.hidden = true;
    scheduleDraw();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    const note = resolveEnterKey(selected, simNodes, options.excerptFor);
    if (note) onNoteSelect(note);
  };
  window.addEventListener("keydown", onKeyDown);

  draw();

  return attachGraphSearch(
    () => {
      window.removeEventListener("keydown", onKeyDown);
      simulation.stop();
      if (drawRaf) cancelAnimationFrame(drawRaf);
      host.innerHTML = "";
    },
    query => {
      options.search = query;
      scheduleDraw();
    },
  );
}
