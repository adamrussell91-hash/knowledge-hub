import { describe, expect, it } from "vitest";
import { briefIsSavable, briefToPage } from "./saveBrief";

const finding = {
  pageId: "page_hub_abc",
  title: "Stoicism notes",
  sourceUrl: "https://example.test/p1",
  excerpt: "CBT borrows exercises",
  stance: "supports" as const,
  analysis: "Links the thesis to the archive.",
};

const developed = `## The claim

CBT secularises Stoic exercises. The archive supports the borrowing, not the genealogy.

The warrant is thinner than the rhetoric: the notes show shared drills, not a clean line of descent.`;

describe("save brief as page", () => {
  it("rejects one-line nudges and accepts a developed brief", () => {
    expect(briefIsSavable("ok")).toBe(false);
    expect(briefIsSavable("Thanks.")).toBe(false);
    expect(briefIsSavable(developed)).toBe(true);
  });

  it("writes a hub note with archive citations only", () => {
    const page = briefToPage({
      reply: developed,
      findings: [
        finding,
        {
          ...finding,
          pageId: "ext-1",
          title: "A web hit",
          sourceUrl: "https://web.example/x",
          external: true,
        },
      ],
      now: "2026-08-21T07:00:00.000Z",
      id: "page_hub_saved",
    });
    expect(page.id).toBe("page_hub_saved");
    expect(page.source).toBe("hub");
    expect(page.area).toBe("notes");
    expect(page.title).toBe("The claim");
    expect(page.body).toContain("CBT secularises");
    expect(page.body).toContain("page_hub_abc");
    expect(page.body).toContain("Stoicism notes");
    expect(page.body).not.toContain("A web hit");
    expect(page.connected).toEqual(["page_hub_abc"]);
    expect(page.origins).toBeUndefined();
    expect(page.schema_version).toBe(1);
  });

  it("stamps a book origin when the sitting came from a book", () => {
    const page = briefToPage({
      reply: developed,
      findings: [finding],
      now: "2026-08-27T07:00:00.000Z",
      id: "page_hub_book",
      origins: [{ kind: "book", label: "  Make It Stick  " }],
    });
    expect(page.origins).toEqual([{ kind: "book", label: "Make It Stick" }]);
  });
});
