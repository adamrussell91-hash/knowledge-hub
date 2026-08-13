import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export function extractLocalLinks(markdown: string): string[] {
  const links: string[] = []; let cursor = 0;
  while (cursor < markdown.length) { const start = markdown.indexOf("](", cursor); if (start < 0) break; let depth = 1; let end = start + 2; while (end < markdown.length && depth) { if (markdown[end] === "(") depth++; if (markdown[end] === ")") depth--; end++; } if (depth) break; const raw = markdown.slice(start + 2, end - 1).split("#")[0]; try { links.push(decodeURIComponent(raw)); } catch { links.push(raw); } cursor = end; }
  return links.filter(link => link && !/^(https?:|mailto:|#)/i.test(link));
}
export function isBinaryAttachment(file: string) { return !file.toLowerCase().endsWith(".md") && !file.endsWith(".DS_Store"); }
export function pageTitle(filename: string) { return filename.replace(/\.md$/, "").replace(/\s+[0-9a-f]{32}$/i, "").trim(); }
export function titleFromMarkdown(filenameTitle: string, markdown: string) { return filenameTitle || markdown.match(/^#\s+(.+)$/m)?.[1].trim() || "Untitled page"; }
function attachmentKind(filename: string) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(filename) ? "image" : /\.pdf$/i.test(filename) ? "pdf" : "file"; }
function contentType(filename: string) { const extension = filename.split(".").pop()?.toLowerCase(); return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream"; }

async function filesAt(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory() ? filesAt(path.join(root, entry.name)) : [path.join(root, entry.name)]))).flat();
}

async function audit(root: string) {
  const all = await filesAt(root); const markdown = all.filter(file => file.endsWith(".md")); const referenced = new Set<string>(); const missing: { page: string; target: string }[] = [];
  for (const page of markdown) for (const link of extractLocalLinks(await readFile(page, "utf8"))) { const target = path.normalize(path.resolve(path.dirname(page), link)); try { if ((await stat(target)).isFile() && isBinaryAttachment(target)) referenced.add(target); } catch { missing.push({ page: path.relative(root, page), target: link }); } }
  const binaries = all.filter(isBinaryAttachment);
  return { source: root, pages: markdown.length, binaries: binaries.length, referencedBinaries: referenced.size, unreferencedBinaries: binaries.filter(file => !referenced.has(file)).map(file => path.relative(root, file)), brokenLinks: missing };
}

if (import.meta.url === `file://${process.argv[1]}`) { const root = process.argv[2]; if (!root) throw new Error("Usage: npm run migrate -- <notion-export-folder>"); const report = await audit(root); const outputDir = path.join(process.cwd(), "migrated"); await mkdir(outputDir, { recursive: true }); await writeFile(path.join(outputDir, "migration-audit.json"), JSON.stringify(report, null, 2)); const now = new Date().toISOString(); const pages = await Promise.all((await filesAt(root)).filter(file => file.endsWith(".md")).map(async file => { const body = await readFile(file, "utf8"); const attachmentTargets = await Promise.all(extractLocalLinks(body).map(async link => { const target = path.resolve(path.dirname(file), link); try { return (await stat(target)).isFile() && isBinaryAttachment(target) ? target : null; } catch { return null; } })); const sourceId = path.basename(file).match(/([0-9a-f]{32})\.md$/i)?.[1] ?? Buffer.from(path.relative(root, file)).toString("hex").slice(0, 32); return { id: `page_notion_${sourceId}`, title: titleFromMarkdown(pageTitle(path.basename(file)), body), area: "university", tags: [], body, attachments: attachmentTargets.filter((target): target is string => target !== null).map(target => ({ id: `attachment_${Buffer.from(path.relative(root, target)).toString("hex").slice(0, 32)}`, kind: attachmentKind(target), r2_key: `university/${path.relative(root, target)}`, filename: path.basename(target), content_type: contentType(target), source_path: path.relative(root, target) })), source_notion_id: sourceId, source_notion_url: "https://notion.so", created_at: now, updated_at: now, schema_version: 1 }; })); await writeFile(path.join(outputDir, "pages-dry-run.json"), JSON.stringify(pages, null, 2)); const stage = path.join(outputDir, "data-repo"); await mkdir(path.join(stage, "pages"), { recursive: true }); await Promise.all(pages.map(page => writeFile(path.join(stage, "pages", `${page.id}.json`), JSON.stringify(page)))); await writeFile(path.join(stage, "manifest.json"), JSON.stringify(pages.map(({ id, title, area, tags, body }) => ({ id, title, area, tags, excerpt: body.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 300), path: `pages/${id}.json` })))); console.log(JSON.stringify({ pages: report.pages, stagedPages: pages.length, referencedBinaries: report.referencedBinaries, unreferencedBinaries: report.unreferencedBinaries.length, brokenLinks: report.brokenLinks.length, outputDir }, null, 2)); }
