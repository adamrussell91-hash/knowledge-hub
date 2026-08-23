import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(dir, "main.ts"), "utf8");
const css = readFileSync(join(dir, "style.css"), "utf8");

describe("Knowledge Hub rail", () => {
  it("does not expose an Alchemist workplace", () => {
    expect(main).not.toContain('data-nav="alchemist"');
    expect(main).not.toContain("renderAlchemist");
    expect(main).not.toContain("runAlchemist");
  });

  it("still renders coach archive citations after the Alchemist rail is gone", () => {
    expect(main).toContain("function findingCards");
  });

  it("replaces Coach and Wiki with Chat", () => {
    expect(main).toContain('data-nav="chat"');
    expect(main).toContain("<span>Chat</span>");
    expect(main).not.toContain('data-nav="wiki"');
    expect(main).not.toContain('data-nav="coach"');
    expect(main).toContain("data-open-chat");
  });

  it("offers a quiet Clean up control beside Edit in the reader", () => {
    expect(main).toContain('class="btn btn--ghost reader__tidy" data-tidy type="button"');
    expect(main).toContain("Clean up");
    expect(main).toContain("Cleaning up…");
    expect(main).toContain("readerTopicPillsHtml");
    expect(main).toContain("cardSupportingText");
    expect(main).not.toMatch(/hub-utilities[\s\S]*data-tidy/);
    expect(main).not.toContain('class="chip"');
  });

  it("keeps reader header actions as the same ghost buttons and drops the hub tile", () => {
    expect(main).toContain('class="btn btn--ghost reader__back" data-back type="button"');
    expect(main).toContain('class="btn btn--ghost" data-edit type="button"');
    expect(main).toContain('class="btn btn--ghost" data-open-chat type="button"');
    expect(main).not.toContain("hub-mark");
    expect(main).not.toContain("icons/knowledge.svg");
    expect(css).toContain("grid-template-areas:");
    expect(css).toContain('"title title"');
    expect(css).not.toMatch(/\.reader__tidy\s*\{[^}]*font-size:/);
  });

  it("filters the archive by origin pills already on notes", () => {
    expect(main).toContain("originFilterHtml");
    expect(main).toContain("pageMatchesOriginFilter");
    expect(main).toContain("topicTagPickerHtml");
    expect(css).toContain(".origin-filters");
    expect(css).toContain(".tag-pill");
    expect(css).toContain(".option-picker");
    expect(css).not.toContain(".filter-chip");
    expect(main).not.toContain("filter-chip");
    expect(main).not.toContain("TOPIC_VOCABULARY.map");
  });

  it("has no University / Notes split in the rail, filters, or compose", () => {
    expect(main).not.toContain('data-nav="university"');
    expect(main).not.toContain('data-nav="notes"');
    expect(main).not.toContain('data-filter="university"');
    expect(main).not.toContain('data-filter="notes"');
    expect(main).not.toContain("compose-area");
    expect(main).not.toContain("University pages stay in the archive");
  });

  it("keeps graph note previews and a portrait chat overlay", () => {
    expect(main).toContain("openPageInNewTab");
    expect(main).toContain("ensureChatOverlay");
    expect(main).toContain("pinChatOverlayNote");
    expect(main).toContain('querySelector<HTMLElement>(".graph-wrap")');
    expect(main).toContain("mountGraphPreview(wrap");
    expect(main).toContain("preview.el.querySelector");
    expect(main).not.toContain("mountGraphPreview(stage");
    expect(css).toContain(".floating-chat-button");
    expect(css).toContain(".floating-chat-button svg");
    expect(css).toContain(".agent-picker__avatar");
    expect(css).toContain(".graph-preview__excerpt");
    expect(css).toMatch(/\.floating-chat-button\s*\{[^}]*background:\s*var\(--wave\)/);
    expect(css).toMatch(/\.chat-overlay\s*\{[^}]*width:\s*min\(24rem, calc\(100vw - 3rem\)\)/);
    expect(css).toMatch(/\.graph-stage\s*\{[^}]*min-height:\s*560px/);
    expect(css).toContain(".universe-zoom");
    expect(css).toContain("body:has(.chat-overlay) .floating-chat-button");
    expect(css).toContain("body:has(.coach.chat) #kh-chat-overlay");
  });

  it("makes Knowledge Hub a home control", () => {
    expect(main).toContain('class="hub-rail__brand" data-home');
    expect(main).toContain('href="#"');
    expect(main).toContain("function goToHome");
  });
});

describe("note reader and editor fill the canvas", () => {
  it("does not cap compose or the reader body to a skinny column", () => {
    expect(css).toContain(".canvas:has(> .compose)");
    expect(css).toContain(".canvas:has(> .reader)");
    expect(css).not.toMatch(/\.compose\s*\{[^}]*max-width:\s*44rem/);
    expect(css).not.toMatch(/\.reader__body\s*\{[^}]*max-width:\s*var\(--measure\)/);
  });

  it("marks the body field so the editor can grow with the page", () => {
    expect(main).toContain("compose__field compose__field--body");
  });
});
