/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { mountGraphPreview } from "./graphPreview";

describe("mountGraphPreview", () => {
  it("shows a card with an up-arrow control that opens the note, and clears on clear()", () => {
    const host = document.createElement("div");
    const onOpen = vi.fn();
    const preview = mountGraphPreview(host, { onOpen });
    expect(host.querySelector(".graph-preview")).toBeTruthy();
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(true);

    preview.show({ pageId: "p1", title: "Twin note", excerpt: "Hello excerpt" });
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(false);
    expect(host.textContent).toContain("Twin note");
    expect(host.textContent).toContain("Hello excerpt");

    const open = host.querySelector<HTMLButtonElement>("[data-open-note]")!;
    expect(open.getAttribute("aria-label")).toBe("Read full note");
    open.click();
    expect(onOpen).toHaveBeenCalledWith("p1");

    preview.clear();
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(true);
  });
});
