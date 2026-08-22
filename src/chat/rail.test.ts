import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const rail = readFileSync(join(dir, "rail.ts"), "utf8");
const css = readFileSync(join(dir, "../style.css"), "utf8");

describe("Chat rail layout", () => {
  it("stacks the composer above the thread and renders replies as markdown", () => {
    expect(css).toContain(".coach.chat");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(rail).toContain("renderMarkdown(turn.content)");
    expect(rail).toContain("thinkingHistoryHtml");
    expect(rail).toContain("searchedNotesHtml");
    expect(rail).toContain("sittingLibrary");
    expect(rail).not.toContain("host.findingCards");
    expect(rail).not.toContain("<p class=\"coach-msg__body\">${escapeHtml(turn.content)}</p>");
  });
});
