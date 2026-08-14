import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import type { ArchiveGraphModel, GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export type ForceGraphHandlers = {
  onKeywordFilter: (keyword: string) => void;
  onPageClick: (pageId: string) => void;
};

type ViewState = { x: number; y: number; k: number };

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

export function mountForceGraph(host: HTMLElement, model: ArchiveGraphModel, handlers: ForceGraphHandlers) {
  const width = host.clientWidth || 1100;
  const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
  host.innerHTML = "";
  host.style.height = `${height}px`;

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
  const view: ViewState = { x: 0, y: 0, k: 0.62 };
  view.x = width / 2 - 760 * view.k;
  view.y = height / 2 - 560 * view.k;

  let hover: GraphNodeDatum | null = null;
  let selected: string | null = null;
  let dragged: GraphNodeDatum | null = null;

  let simNodes: GraphNodeDatum[] = model.nodes.map(node => ({ ...node }));
  let simLinks: GraphLinkDatum[] = model.links.map(link => ({ ...link }));
  let simulation: Simulation<GraphNodeDatum, GraphLinkDatum> = createSimulation();

  function createSimulation() {
    return forceSimulation(simNodes)
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
            if (node.kind === "major") return -2400;
            if (node.kind === "minor") return -320;
            return -28;
          })
          .distanceMax(1200),
      )
      .force(
        "x",
        forceX<GraphNodeDatum>(node => node.x ?? 760).strength(node => {
          if (node.kind === "major") return 0.12;
          if (node.kind === "minor") return 0.06;
          return 0.02;
        }),
      )
      .force(
        "y",
        forceY<GraphNodeDatum>(node => node.y ?? 560).strength(node => {
          if (node.kind === "major") return 0.12;
          if (node.kind === "minor") return 0.06;
          return 0.02;
        }),
      )
      .force(
        "collide",
        forceCollide<GraphNodeDatum>()
          .radius(node => {
            if (node.kind === "major") return node.r + 44;
            if (node.kind === "minor") return node.r + 18;
            return node.r + 8;
          })
          .strength(0.95),
      )
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on("tick", draw);
  }

  function restartSimulation() {
    simulation.stop();
    simulation = createSimulation();
  }

  function byId() {
    return new Map(simNodes.map(node => [node.id, node]));
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
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const node = simNodes[i];
      const dx = (node.x ?? 0) - x;
      const dy = (node.y ?? 0) - y;
      const dist = Math.hypot(dx, dy);
      const pad = node.kind === "major" ? 8 : node.kind === "minor" ? 6 : 4;
      if (dist <= node.r + pad && dist < best) {
        best = dist;
        hit = node;
      }
    }
    return hit;
  };

  function isActivePair(source: GraphNodeDatum, target: GraphNodeDatum) {
    if (!hover && !selected) return false;
    const labels = new Set(
      [hover?.label, hover?.parentKeyword, selected].filter(Boolean) as string[],
    );
    return labels.has(source.label) || labels.has(target.label) ||
      (source.parentKeyword != null && labels.has(source.parentKeyword)) ||
      (target.parentKeyword != null && labels.has(target.parentKeyword));
  }

  function draw() {
    const map = byId();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    const maxWeight = Math.max(...simLinks.map(link => link.weight), 1);
    const focusing = Boolean(selected);

    for (const link of simLinks) {
      const { source, target } = linkEnds(link, map);
      if (!source?.x || !target?.x || source.y == null || target.y == null) continue;

      const active = isActivePair(source, target);
      const dim = focusing && !active;

      ctx.beginPath();
      curve(ctx, source.x, source.y, target.x, target.y);

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
        const thick = 1 + (link.weight / maxWeight) * 4.5;
        if (active) {
          ctx.strokeStyle = "#e07a2f";
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = (thick + 1.4) / view.k;
        } else {
          ctx.strokeStyle = link.color;
          ctx.globalAlpha = dim ? 0.05 : 0.2;
          ctx.lineWidth = thick / view.k;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (const node of simNodes) {
      if (node.kind !== "leaf" || node.x == null || node.y == null) continue;
      const hot = hover === node || selected === node.parentKeyword;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = hot ? 1 : 0.8;
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
        ctx.fillText(text, node.x + node.r + 6, node.y);
      }
    }

    for (const node of simNodes) {
      if (node.kind !== "minor" || node.x == null || node.y == null) continue;
      const hot = hover === node || selected === node.label || selected === node.parentKeyword;
      const dim = focusing && !hot;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
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
      const hot = hover === node || selected === node.label;
      const dim = focusing && selected !== node.label &&
        !simNodes.some(item => item.kind === "minor" && item.parentKeyword === node.label && item.label === selected);
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
      const next = Math.min(2.4, Math.max(0.28, view.k * (event.deltaY < 0 ? 1.08 : 0.92)));
      view.x = event.clientX - canvas.getBoundingClientRect().left - world.x * next;
      view.y = event.clientY - canvas.getBoundingClientRect().top - world.y * next;
      view.k = next;
      draw();
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
      simulation.alphaTarget(0.15).restart();
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...view };
    const onMove = (move: PointerEvent) => {
      view.x = origin.x + (move.clientX - startX);
      view.y = origin.y + (move.clientY - startY);
      draw();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  canvas.addEventListener("pointermove", event => {
    const world = toWorld(event.clientX, event.clientY);
    if (dragged) {
      dragged.fx = world.x;
      dragged.fy = world.y;
      return;
    }
    const node = findNode(world.x, world.y);
    hover = node;
    canvas.style.cursor = node ? "pointer" : "grab";
    if (node) {
      tip.hidden = false;
      if (node.kind === "major") {
        tip.textContent = `${node.label} · ${node.count} notes · click to focus · double-click for list`;
      } else if (node.kind === "minor") {
        tip.textContent = `${node.label} · sub-theme of ${node.parentKeyword} · click + for notes`;
      } else {
        tip.textContent = node.label;
      }
      tip.style.left = `${event.clientX - host.getBoundingClientRect().left + 12}px`;
      tip.style.top = `${event.clientY - host.getBoundingClientRect().top + 12}px`;
    } else {
      tip.hidden = true;
    }
    draw();
  });

  canvas.addEventListener("pointerup", event => {
    if (!dragged) return;
    const node = dragged;
    dragged = null;
    node.fx = null;
    node.fy = null;
    simulation.alphaTarget(0);
    const world = toWorld(event.clientX, event.clientY);
    const still = findNode(world.x, world.y);
    if (!(still && still.id === node.id)) return;

    if (node.kind === "major") {
      if (event.detail >= 2) {
        handlers.onKeywordFilter(node.label);
        return;
      }
      focusMajor(node.label);
      return;
    }
    if (node.kind === "minor") {
      if (event.detail >= 2) {
        handlers.onKeywordFilter(node.label);
        return;
      }
      expandMinor(node.label);
      return;
    }
    if (node.pageId) handlers.onPageClick(node.pageId);
  });

  canvas.addEventListener("pointerleave", () => {
    hover = null;
    tip.hidden = true;
    draw();
  });

  draw();

  return () => {
    simulation.stop();
    host.innerHTML = "";
  };
}
