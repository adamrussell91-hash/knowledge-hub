import { ORIGIN_KINDS, type Origin } from "../domain/page";
import { escapeHtml } from "../lib/dom";
import { ORIGIN_KIND_LABELS, pageOrigins } from "./normalize";

export function originPillsHtml(origins: Origin[], options: { removable?: boolean } = {}) {
  if (!origins.length) return "";
  const pills = origins
    .map(origin => {
      const kind = ORIGIN_KIND_LABELS[origin.kind];
      const remove = options.removable
        ? `<button type="button" class="origin-pill__remove" data-origin-remove="${escapeHtml(origin.kind)}:${escapeHtml(origin.label)}" aria-label="Remove ${kind} ${origin.label}">×</button>`
        : "";
      return `<span class="origin-pill" role="listitem"><span class="origin-pill__kind">${escapeHtml(kind)}</span> ${escapeHtml(origin.label)}${remove}</span>`;
    })
    .join("");
  return `<div class="origin-pills" role="list" aria-label="Origin">${pills}</div>`;
}

export function originComposeFieldHtml(origins: Origin[]) {
  const options = ORIGIN_KINDS.map(
    kind => `<option value="${kind}">${escapeHtml(ORIGIN_KIND_LABELS[kind])}</option>`,
  ).join("");
  return `<div class="compose__field">
        <label id="compose-origins-label">Origin</label>
        <p class="compose__hint">Degree, unit, notebook, book, or PD session. The archive filters by these.</p>
        ${originPillsHtml(pageOrigins({ origins }), { removable: true }) || `<p class="compose__hint">None yet.</p>`}
        <div class="origin-add">
          <select id="compose-origin-kind" aria-label="Origin kind">${options}</select>
          <input id="compose-origin-label" aria-label="Origin label" placeholder="EDST5805, MEd, notebook name…" />
          <button type="button" class="btn btn--ghost" data-origin-add>Add</button>
        </div>
      </div>`;
}

export function parseOriginRemoveValue(raw: string): Origin | null {
  const split = raw.indexOf(":");
  if (split < 1) return null;
  const kind = raw.slice(0, split);
  const label = raw.slice(split + 1);
  if (!ORIGIN_KINDS.includes(kind as Origin["kind"]) || !label) return null;
  return { kind: kind as Origin["kind"], label };
}
