import { ORIGIN_KINDS, type Origin } from "../domain/page";
import { escapeHtml } from "../lib/dom";
import { ORIGIN_KIND_LABELS, originKey, pageOrigins } from "./normalize";

export type OriginPillsOptions = {
  removable?: boolean;
  editable?: boolean;
  openEdit?: boolean;
  editing?: Origin | null;
};

function originValue(origin: Origin) {
  return `${origin.kind}:${origin.label}`;
}

export function originPillsHtml(origins: Origin[], options: OriginPillsOptions = {}) {
  if (!origins.length) return "";
  const pills = origins
    .map(origin => {
      const kind = ORIGIN_KIND_LABELS[origin.kind];
      const value = escapeHtml(originValue(origin));
      const selected = options.editing && originKey(options.editing) === originKey(origin);
      const remove = options.removable
        ? `<button type="button" class="origin-pill__remove" data-origin-remove="${value}" aria-label="Remove ${kind} ${origin.label}">×</button>`
        : "";
      const body = `<span class="origin-pill__kind">${escapeHtml(kind)}</span><span class="origin-pill__label">${escapeHtml(origin.label)}</span>`;
      if (options.openEdit) {
        return `<button type="button" class="tag-pill origin-pill is-selected" data-edit-origins="${value}">${body}</button>`;
      }
      const inner = options.editable
        ? `<button type="button" class="origin-pill__edit" data-origin-edit="${value}">${body}</button>`
        : body;
      return `<div class="tag-pill origin-pill${selected ? " is-selected" : ""}" role="listitem">${inner}${remove}</div>`;
    })
    .join("");
  return `<div class="origin-pills" role="list" aria-label="Origin">${pills}</div>`;
}

export function originComposeFieldHtml(origins: Origin[], editing: Origin | null = null) {
  const options = ORIGIN_KINDS.map(kind => {
    const selected = editing?.kind === kind ? " selected" : "";
    return `<option value="${kind}"${selected}>${escapeHtml(ORIGIN_KIND_LABELS[kind])}</option>`;
  }).join("");
  return `<div class="compose__field">
        <label id="compose-origins-label">Origin</label>
        <p class="compose__hint">Tap a pill to change it. Degree, unit, notebook, book, or PD session.</p>
        ${originPillsHtml(pageOrigins({ origins }), { removable: true, editable: true, editing }) || `<p class="compose__hint">None yet.</p>`}
        <div class="origin-add">
          <select id="compose-origin-kind" aria-label="Origin kind">${options}</select>
          <input id="compose-origin-label" aria-label="Origin label" placeholder="EDST5805, MEd, notebook name…" value="${escapeHtml(editing?.label ?? "")}" />
          <button type="button" class="btn btn--ghost" data-origin-add>${editing ? "Save" : "Add"}</button>
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
