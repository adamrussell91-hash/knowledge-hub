const CHEVRON = `<svg class="hub-filter__chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4 5 6.5 7.5 4"/></svg>`;
const TICK = `<svg class="hub-menu__tick" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.3 4.8 8.6 9.5 3.6"/></svg>`;

/** @type {{ menu: HTMLElement, btn: HTMLButtonElement, close: (focus?: boolean) => void } | null} */
let openMenu = null;

function optionLabel(option) {
  return option.label ?? String(option.value ?? '');
}

function findOption(options, value) {
  return options.find((option) => String(option.value) === String(value)) ?? options[0] ?? { value: '', label: '' };
}

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeOption);
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(normalizeOption);
  } catch {
    return [];
  }
}

function normalizeOption(option) {
  if (option && typeof option === 'object') {
    return { value: option.value ?? '', label: option.label ?? String(option.value ?? '') };
  }
  return { value: option, label: String(option) };
}

function paintTrigger(btn, options, value, defaultValue) {
  const current = findOption(options, value);
  const label = btn.querySelector('[data-hub-value]');
  if (label) label.textContent = optionLabel(current);
  btn.dataset.hubValue = String(current.value);
  btn.classList.toggle('is-set', String(current.value) !== String(defaultValue));
}

function closeOpenMenu(returnFocus = false) {
  if (!openMenu) return;
  const { menu, btn, close } = openMenu;
  openMenu = null;
  close(returnFocus);
  btn.setAttribute('aria-expanded', 'false');
  menu.remove();
}

function positionMenu(menu, btn) {
  const rect = btn.getBoundingClientRect();
  const flip = rect.bottom + menu.offsetHeight + 12 > window.innerHeight && rect.top > menu.offsetHeight;
  const left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12);
  menu.style.left = `${Math.max(12, left + window.scrollX)}px`;
  menu.style.top = `${(flip ? rect.top - menu.offsetHeight - 6 : rect.bottom + 6) + window.scrollY}px`;
  menu.classList.toggle('hub-menu--above', flip);
}

function openFilterMenu(btn, options, currentValue, onSelect) {
  closeOpenMenu();

  const menu = document.createElement('div');
  menu.className = 'hub-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', btn.dataset.hubFilter || 'Filter');
  menu.innerHTML =
    `<div class="hub-menu__head">${btn.dataset.hubFilter || 'Filter'}</div>` +
    options
      .map((option) => {
        const selected = String(option.value) === String(currentValue);
        return `<button class="hub-menu__opt" type="button" role="menuitemradio" data-hub-option="${escapeAttr(
          option.value
        )}" aria-checked="${selected}" tabindex="-1"><span>${escapeHtml(optionLabel(option))}</span>${TICK}</button>`;
      })
      .join('');

  document.body.append(menu);
  positionMenu(menu, btn);
  requestAnimationFrame(() => menu.classList.add('is-open'));
  btn.setAttribute('aria-expanded', 'true');

  const items = [...menu.querySelectorAll('.hub-menu__opt')];
  const close = (returnFocus) => {
    menu.classList.remove('is-open');
    if (returnFocus) btn.focus();
  };
  openMenu = { menu, btn, close };

  menu.addEventListener('click', (event) => {
    const opt = event.target.closest('.hub-menu__opt');
    if (!opt) return;
    event.stopPropagation();
    onSelect(opt.dataset.hubOption ?? '');
    closeOpenMenu(true);
  });

  menu.addEventListener('keydown', (event) => {
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      closeOpenMenu(true);
    }
  });

  const onDoc = (event) => {
    if (!openMenu) return;
    if (!menu.contains(event.target) && !btn.contains(event.target)) closeOpenMenu();
  };
  document.addEventListener('click', onDoc);
  const previousClose = openMenu.close;
  openMenu.close = (returnFocus) => {
    document.removeEventListener('click', onDoc);
    previousClose(returnFocus);
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function createHubFilter({
  key,
  label,
  defaultValue = '',
  options = [],
  value = defaultValue,
  onChange
} = {}) {
  const normalized = parseOptions(options);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hub-filter';
  btn.dataset.hubFilter = key || label || 'Filter';
  btn.dataset.hubDefault = String(defaultValue);
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', label || key || 'Filter');
  btn.innerHTML = `<span class="hub-filter__key">${escapeHtml(key || '')}</span><span data-hub-value></span>${CHEVRON}`;

  let currentOptions = normalized;
  let currentValue = value;

  const sync = () => paintTrigger(btn, currentOptions, currentValue, defaultValue);
  sync();

  const setValue = (next, emit = false) => {
    currentValue = next;
    sync();
    if (emit) onChange?.(currentValue);
  };

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (openMenu?.btn === btn) {
      closeOpenMenu();
      return;
    }
    openFilterMenu(btn, currentOptions, currentValue, (next) => setValue(next, true));
  });

  btn.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (openMenu?.btn !== btn) {
      openFilterMenu(btn, currentOptions, currentValue, (next) => setValue(next, true));
    }
    const items = openMenu?.menu.querySelectorAll('.hub-menu__opt') ?? [];
    (event.key === 'ArrowUp' ? items[items.length - 1] : items[0])?.focus();
  });

  return {
    el: btn,
    getValue: () => currentValue,
    setValue: (next) => setValue(next, false),
    setOptions: (nextOptions, nextValue = currentValue) => {
      currentOptions = parseOptions(nextOptions);
      currentValue = nextValue;
      sync();
    },
    dispose: () => {
      if (openMenu?.btn === btn) closeOpenMenu();
    }
  };
}

export function bindHubFilter(btn, { onChange } = {}) {
  const options = parseOptions(btn.dataset.hubOptions);
  const defaultValue = btn.dataset.hubDefault ?? '';
  const label = btn.querySelector('[data-hub-value]');
  const start = options.find((option) => optionLabel(option) === label?.textContent?.trim())?.value ?? defaultValue;
  const filter = createHubFilter({
    key: btn.dataset.hubFilter,
    label: btn.getAttribute('aria-label') || btn.dataset.hubFilter,
    defaultValue,
    options,
    value: start,
    onChange
  });
  btn.replaceWith(filter.el);
  return filter;
}
