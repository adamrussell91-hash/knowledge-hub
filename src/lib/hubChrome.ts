import { USE_LOCAL_DATA } from "../api/client";

/** Sign-out icon from design-kit/snippets/hub-utilities.html (sign-out only). */
const SIGN_OUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
      <path d="M15 12H3" />
      <path d="m7 8-4 4 4 4" />
    </svg>`;

/**
 * Discrete canvas top-right utilities. Knowledge Hub has no refresh affordance,
 * so this is sign-out alone. Keep `data-logout` for the shell click handler.
 */
export function hubUtilitiesHtml(): string {
  if (USE_LOCAL_DATA) return "";
  return `<div class="hub-utilities">
  <button class="hub-icon-btn" type="button" data-logout aria-label="Sign out" title="Sign out">
    ${SIGN_OUT_ICON}
  </button>
</div>`;
}

/** Wrap utilities in `.page-header__actions` when present. */
export function hubUtilitiesActionsHtml(): string {
  const utilities = hubUtilitiesHtml();
  return utilities ? `<div class="page-header__actions">${utilities}</div>` : "";
}
