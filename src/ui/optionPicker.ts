import { escapeHtml } from "../lib/dom";

export type PickerOption = {
  label: string;
  detail?: string;
};

export function asPickerOptions(options: Array<string | PickerOption>): PickerOption[] {
  return options.map(item => (typeof item === "string" ? { label: item } : item));
}

export function filterPickerOptions(labels: Array<string | PickerOption>, query: string) {
  const needle = query.trim().toLowerCase();
  const options = asPickerOptions(labels);
  if (!needle) return options;
  return options.filter(option => option.label.toLowerCase().includes(needle));
}

export function optionPickerListHtml(input: {
  options: Array<string | PickerOption>;
  optionAttr: string;
  emptyLabel: string;
}) {
  const options = asPickerOptions(input.options);
  if (!options.length) {
    return `<p class="option-picker__empty">${escapeHtml(input.emptyLabel)}</p>`;
  }
  const items = options
    .map(option => {
      const detail = option.detail
        ? `<span class="option-picker__detail">${escapeHtml(option.detail)}</span>`
        : "";
      return `<li>
        <button type="button" class="option-picker__option" role="option" ${input.optionAttr}="${escapeHtml(option.label)}">
          <span class="option-picker__name">${escapeHtml(option.label)}</span>
          ${detail}
        </button>
      </li>`;
    })
    .join("");
  return `<ul class="option-picker__list" role="listbox">${items}</ul>`;
}

export function optionPickerHtml(input: {
  selected: string[];
  options: Array<string | PickerOption>;
  query: string;
  open: boolean;
  searchId: string;
  searchLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  countLabel?: string;
  capHint?: string;
  addLabel: string;
  changeLabel?: string;
  atCap?: boolean;
  selectedAttr: string;
  optionAttr: string;
}) {
  const catalog = asPickerOptions(input.options);
  const remaining = catalog.filter(
    option => !input.selected.some(item => item.toLowerCase() === option.label.toLowerCase()),
  );
  const visible = filterPickerOptions(remaining, input.query);
  const chosen = input.selected
    .map(
      label =>
        `<button type="button" class="tag-pill is-selected" ${input.selectedAttr}="${escapeHtml(label)}" aria-pressed="true">${escapeHtml(label)}</button>`,
    )
    .join("");
  const showCatalog = input.open && !input.atCap && remaining.length > 0;
  const showChange = Boolean(
    input.changeLabel && input.selected.length && remaining.length && !showCatalog && !input.atCap,
  );
  const showAdd = !input.atCap && remaining.length > 0 && !showCatalog && !showChange;
  const add = showAdd
    ? `<button type="button" class="tag-pill option-picker__add" data-picker-open aria-expanded="false">${escapeHtml(input.addLabel)}</button>`
    : "";
  const change = showChange
    ? `<button type="button" class="tag-pill option-picker__add" data-picker-open aria-expanded="false">${escapeHtml(input.changeLabel!)}</button>`
    : "";
  const catalogHtml = showCatalog
    ? `<div class="option-picker__panel">
        <div class="option-picker__toolbar">
          <label class="option-picker__search-label" for="${escapeHtml(input.searchId)}">${escapeHtml(input.searchLabel)}</label>
          <button type="button" class="btn btn--ghost option-picker__close" data-picker-close>Close</button>
        </div>
        <input id="${escapeHtml(input.searchId)}" class="option-picker__search" type="search" value="${escapeHtml(input.query)}" placeholder="${escapeHtml(input.searchPlaceholder)}" autocomplete="off" aria-expanded="true" />
        ${input.countLabel ? `<p class="option-picker__count">${escapeHtml(input.countLabel)}</p>` : ""}
        <div data-picker-list>${optionPickerListHtml({
          options: visible,
          optionAttr: input.optionAttr,
          emptyLabel: input.emptyLabel,
        })}</div>
      </div>`
    : "";
  const cap = input.atCap && input.capHint ? `<p class="compose__hint option-picker__cap">${escapeHtml(input.capHint)}</p>` : "";
  return `<div class="option-picker">
      <div class="option-picker__chosen tag-pills">${chosen}${add}${change}</div>
      ${cap}
      ${catalogHtml}
    </div>`;
}
