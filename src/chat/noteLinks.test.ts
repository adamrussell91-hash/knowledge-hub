import { describe, expect, it } from "vitest";
import { renderChatMarkdown, rewriteBareArchiveIds, titlesFromNotes } from "./noteLinks";

const dmgt = "page_notion_1aaf794f84768020a2aec3db6939dedc";
const motivation = "page_notion_225f794f847681fd8720fa557e6d8d4b";

describe("rewriteBareArchiveIds", () => {
  it("turns parenthetical page ids into titled markdown links", () => {
    const titles = titlesFromNotes([
      { pageId: dmgt, title: "Gagné DMGT 2.0" },
      { pageId: motivation, title: "Motivation in giftedness and talent" },
    ]);
    const rewritten = rewriteBareArchiveIds(
      `Motivation is a catalyst (${dmgt}). The wellbeing note (${motivation}) makes the connection.`,
      titles,
    );
    expect(rewritten).toContain(`[Gagné DMGT 2.0](${dmgt})`);
    expect(rewritten).toContain(`[Motivation in giftedness and talent](${motivation})`);
    expect(rewritten).not.toContain(`catalyst (${dmgt})`);
  });

  it("leaves existing markdown links alone", () => {
    const rewritten = rewriteBareArchiveIds(`[Gagné DMGT 2.0](${dmgt}) already linked.`, [
      { pageId: dmgt, title: "Different title" },
    ]);
    expect(rewritten).toBe(`[Gagné DMGT 2.0](${dmgt}) already linked.`);
  });
});

describe("renderChatMarkdown", () => {
  it("renders a live note link instead of a raw page id", () => {
    const html = renderChatMarkdown(`developed talent (${dmgt}).`, [
      { pageId: dmgt, title: "Gagné DMGT 2.0" },
    ]);
    expect(html).toContain('class="note-link"');
    expect(html).toContain(`data-open-page="${dmgt}"`);
    expect(html).toContain(`href="#page/${encodeURIComponent(dmgt)}"`);
    expect(html).toContain("Gagné DMGT 2.0");
    expect(html).not.toContain(`(${dmgt})`);
  });
});
