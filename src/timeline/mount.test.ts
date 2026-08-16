/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "./build";
import { mountKeywordTimeline } from "./mount";

describe("mountKeywordTimeline", () => {
  it("opens the note when a node is clicked", () => {
    const host = document.createElement("div");
    const onPageClick = vi.fn();
    const model = buildTimeline([
      {
        id: "page_sdt",
        title: "Self-determination theory",
        excerpt: "autonomy",
        area: "notes",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    mountKeywordTimeline(host, { model, onPageClick });
    const button = host.querySelector<HTMLButtonElement>("[data-page-id='page_sdt']");
    expect(button).toBeTruthy();
    button?.click();
    expect(onPageClick).toHaveBeenCalledWith("page_sdt");
  });
});
