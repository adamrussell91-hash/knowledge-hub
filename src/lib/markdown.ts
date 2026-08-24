import { pageHashForId, pageIdFromHash } from "../routing/pageHash";

const ARCHIVE_HREF = /^(page_(?:notion|hub)_[^)\s]+|#page\/[^)\s]+)$/i;

function noteAnchor(label: string, target: string): string {
  const pageId = target.startsWith("#page/") ? pageIdFromHash(target) : target;
  if (!pageId) return `<span class="md-link">${label}</span>`;
  return `<a class="note-link" href="${pageHashForId(pageId)}" data-open-page="${pageId}">${label}</a>`;
}

/** Lightweight Markdown → HTML for Notion-export note bodies. */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const inline = (text: string) =>
    escape(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
        ARCHIVE_HREF.test(href) ? noteAnchor(label, href) : `<span class="md-link">${label}</span>`,
      );

  const isTableRow = (text: string) => /^\s*\|.+\|\s*$/.test(text);
  const isTableSep = (text: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(text);
  const tableCells = (text: string) =>
    text
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(cell => cell.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      closeLists();
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      closeLists();
      html.push("<hr />");
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level + 2}>${inline(heading[2])}</h${level + 2}>`);
      i++;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeLists();
      const chunks = [quote[1]];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        chunks.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${chunks.map(chunk => `<p>${inline(chunk)}</p>`).join("")}</blockquote>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      i++;
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeLists();
      const header = tableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]) && !isTableSep(lines[i])) {
        rows.push(tableCells(lines[i]));
        i++;
      }
      html.push(
        `<div class="md-table-wrap"><table><thead><tr>${header
          .map(cell => `<th>${inline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    closeLists();
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s|>|---+\s*$)/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }

  closeLists();
  return html.join("\n");
}

function escape(text: string) {
  return text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}
