import { ORIGIN_KINDS, type Origin, type OriginKind } from "../domain/page";
import { escapeHtml } from "../lib/dom";
import { ORIGIN_KIND_LABELS, pageMatchesOrigins } from "../origin/normalize";
import { resolvedOrigins } from "../origin/notesPlace";

export type OriginFilterState = {
  kind: OriginKind | "";
  label: string;
};

export function emptyOriginFilter(): OriginFilterState {
  return { kind: "", label: "" };
}

export function pageMatchesOriginFilter(
  page: { id?: string; origins?: Origin[]; source_notion_id?: string; source_notion_url?: string },
  filter: OriginFilterState,
) {
  const origins = resolvedOrigins(page);
  if (!filter.kind) return true;
  if (filter.label) return pageMatchesOrigins({ origins }, [{ kind: filter.kind, label: filter.label }]);
  return origins.some(origin => origin.kind === filter.kind);
}

export function originLabelsForKind(
  entries: { id?: string; origins?: Origin[]; source_notion_id?: string; source_notion_url?: string }[],
  kind: OriginKind,
) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const labels = new Set(resolvedOrigins(entry).filter(origin => origin.kind === kind).map(origin => origin.label));
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

export function originFilterTitle(filter: OriginFilterState) {
  if (filter.label) return filter.label;
  if (filter.kind) return ORIGIN_KIND_LABELS[filter.kind];
  return "";
}

export function toggleOriginKind(filter: OriginFilterState, kind: OriginKind): OriginFilterState {
  if (filter.kind === kind) return emptyOriginFilter();
  return { kind, label: "" };
}

export function toggleOriginLabel(filter: OriginFilterState, label: string): OriginFilterState {
  if (!filter.kind) return filter;
  if (filter.label === label) return { kind: filter.kind, label: "" };
  return { kind: filter.kind, label };
}

function filterPill(label: string, selected: boolean, attrs: string) {
  return `<button type="button" class="tag-pill${selected ? " is-selected" : ""}" aria-pressed="${selected}" ${attrs}>${escapeHtml(label)}</button>`;
}

export function originFilterHtml(entries: { id?: string; origins?: Origin[] }[], filter: OriginFilterState) {
  const kinds = ORIGIN_KINDS.map(kind =>
    filterPill(ORIGIN_KIND_LABELS[kind], filter.kind === kind, `data-origin-kind="${kind}"`),
  ).join("");
  const clear = filter.kind
    ? filterPill(`Clear ${filter.label || ORIGIN_KIND_LABELS[filter.kind]}`, true, "data-clear-origin")
    : "";
  let labels = "";
  if (filter.kind) {
    const options = originLabelsForKind(entries, filter.kind);
    if (!options.length) {
      labels = `<p class="list-count">No ${escapeHtml(ORIGIN_KIND_LABELS[filter.kind].toLowerCase())} pills on notes yet.</p>`;
    } else {
      const chips = options
        .map(item =>
          filterPill(item.label, filter.label === item.label, `data-origin-label="${escapeHtml(item.label)}"`),
        )
        .join("");
      labels = `<div class="tag-pills" role="list" aria-label="${escapeHtml(ORIGIN_KIND_LABELS[filter.kind])} filters">${chips}</div>`;
    }
  }
  return `<div class="origin-filters">
      <div class="tag-pills" role="group" aria-label="Origin">${kinds}${clear}</div>
      ${labels}
    </div>`;
}
