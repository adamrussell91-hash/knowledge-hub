import { escapeHtml } from "../lib/dom";
import type { TimelineModel } from "./build";

export function mountKeywordTimeline(
  host: HTMLElement,
  options: { model: TimelineModel; onPageClick: (pageId: string) => void },
) {
  const { model, onPageClick } = options;
  const maxLane = model.nodes.reduce((max, node) => Math.max(max, node.lane), 0);
  const height = 160 + maxLane * 56;
  host.innerHTML = `<div class="timeline" style="--timeline-height:${height}px">
    <div class="timeline__axis" aria-hidden="true"></div>
    <div class="timeline__ticks">
      ${model.ticks
        .map(
          tick =>
            `<span class="timeline__tick" style="left:${(tick.t * 100).toFixed(3)}%">${escapeHtml(tick.label)}</span>`,
        )
        .join("")}
    </div>
    <div class="timeline__nodes">
      ${model.nodes
        .map(
          (node, index) =>
            `<button class="timeline__node" type="button" data-page-id="${escapeHtml(node.id)}" style="left:${(node.t * 100).toFixed(3)}%; --lane:${node.lane}; --i:${Math.min(index, 23)}" title="${escapeHtml(node.title)}">
              <span class="timeline__node-title">${escapeHtml(node.title)}</span>
              <span class="timeline__node-date">${escapeHtml(node.dateLabel)}</span>
            </button>`,
        )
        .join("")}
    </div>
  </div>`;
  host.querySelectorAll<HTMLButtonElement>("[data-page-id]").forEach(button => {
    button.onclick = () => onPageClick(button.dataset.pageId!);
  });
}
