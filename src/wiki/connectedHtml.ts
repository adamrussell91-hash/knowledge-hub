import { escapeHtml } from "../lib/dom";

export function connectedLinksHtml(
  page: { connected?: string[] },
  entries: { id: string; title: string }[],
): string {
  const ids = page.connected ?? [];
  if (!ids.length) return "";
  return `<section class="wiki-links" aria-label="Connected notes">
              <h3>Connected</h3>
              <ul>${ids
                .map(id => {
                  const title = entries.find(entry => entry.id === id)?.title ?? id;
                  return `<li><button type="button" data-open-page="${escapeHtml(id)}">${escapeHtml(title)}</button></li>`;
                })
                .join("")}</ul>
            </section>`;
}
