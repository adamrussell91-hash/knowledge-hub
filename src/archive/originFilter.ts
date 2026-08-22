import { ORIGIN_KINDS, type Origin, type OriginKind } from "../domain/page";
import { escapeHtml } from "../lib/dom";
import { ORIGIN_KIND_LABELS, pageMatchesOrigins, pageOrigins } from "../origin/normalize";

export type OriginFilterState = {
  kind: OriginKind | "";
  label: string;
};

export function emptyOriginFilter(): OriginFilterState {
  return { kind: "", label: "" };
}

export function pageMatchesOriginFilter(page: { origins?: Origin[] }, filter: OriginFilterState) {
  if (!filter.kind) return true;
  if (filter.label) return pageMatchesOrigins(page, [{ kind: filter.kind, label: filter.label }]);
  return pageOrigins(page).some(origin => origin.kind === filter.kind);
}

export function originLabelsForKind(entries: { origins?: Origin[] }[], kind: OriginKind) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const labels = new Set(pageOrigins(entry).filter(origin => origin.kind === kind).map(origin => origin.label));
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

export function originFilterHtml(entries: { origins?: Origin[] }[], filter: OriginFilterState) {
  const kinds = ORIGIN_KINDS.map(kind => {
    const active = filter.kind === kind ? " is-active" : "";
    return `<button class="filter-chip${active}" type="button" data-origin-kind="${kind}">${escapeHtml(ORIGIN_KIND_LABELS[kind])}</button>`;
  }).join("");
  const clear = filter.kind
    ? `<button class="filter-chip is-active" type="button" data-clear-origin>Clear ${escapeHtml(
        filter.label || ORIGIN_KIND_LABELS[filter.kind],
      )}</button>`
    : "";
  let labels = "";
  if (filter.kind) {
    const options = originLabelsForKind(entries, filter.kind);
    if (!options.length) {
      labels = `<p class="list-count">No ${escapeHtml(ORIGIN_KIND_LABELS[filter.kind].toLowerCase())} pills on notes yet.</p>`;
    } else {
      const chips = options
        .map(item => {
          const active = filter.label === item.label ? " is-active" : "";
          return `<button class="filter-chip${active}" type="button" data-origin-label="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`;
        })
        .join("");
      labels = `<div class="filters" role="list" aria-label="${escapeHtml(ORIGIN_KIND_LABELS[filter.kind])} filters">${chips}</div>`;
    }
  }
  return `<div class="origin-filters">
      <div class="filters" role="tablist" aria-label="Origin">${kinds}${clear}</div>
      ${labels}
    </div>`;
}
