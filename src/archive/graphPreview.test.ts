/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { mountGraphPreview } from "./graphPreview";

describe("mountGraphPreview", () => {
  it("shows title, origin, three tags, summary, and opens the full note", () => {
    const host = document.createElement("div");
    const onOpen = vi.fn();
    const preview = mountGraphPreview(host, { onOpen });
    expect(host.querySelector(".graph-preview")).toBeTruthy();
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(true);

    preview.show({
      pageId: "p1",
      title: "Retrieval practice and spacing",
      excerpt: "Spacing and retrieval strengthen long-term memory.",
      tags: [
        "Learning Science and Cognition",
        "Motivation and Self Regulation",
        "Assessment Feedback and Evaluation",
        "Note",
      ],
      origins: [{ kind: "unit", label: "EDST5805" }],
    });
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(false);
    expect(host.textContent).toContain("Retrieval practice and spacing");
    expect(host.textContent).toContain("Spacing and retrieval strengthen long-term memory.");
    expect(host.textContent).toContain("EDST5805");
    expect(host.textContent).toContain("Unit");
    expect(host.textContent).toContain("Learning Science and Cognition");
    expect(host.textContent).toContain("Motivation and Self Regulation");
    expect(host.textContent).toContain("Assessment Feedback and Evaluation");
    expect(host.textContent).not.toContain("Note");

    const open = host.querySelector<HTMLButtonElement>("[data-open-note]")!;
    expect(open.textContent).toBe("Open full note");
    open.click();
    expect(onOpen).toHaveBeenCalledWith("p1");

    preview.clear();
    expect(host.querySelector<HTMLElement>(".graph-preview")!.hidden).toBe(true);
  });
});
