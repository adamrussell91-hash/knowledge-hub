import { describe, expect, it } from "vitest";
import { fetchPageBody } from "./fetchPageBody";

describe("fetchPageBody", () => {
  it("prefers the R2 page mirror over GitHub", async () => {
    const page = await fetchPageBody("p1", {
      fromR2: async () => ({
        id: "p1",
        title: "From R2",
        body: "body",
        source_notion_url: "https://notion.so/p1",
      }),
      fromGitHub: async () => ({
        id: "p1",
        title: "From GitHub",
        body: "body",
        source_notion_url: "https://notion.so/p1",
      }),
    });
    expect(page?.title).toBe("From R2");
  });

  it("falls back to GitHub when the mirror is missing", async () => {
    const page = await fetchPageBody("p1", {
      fromR2: async () => null,
      fromGitHub: async () => ({
        id: "p1",
        title: "From GitHub",
        body: "body",
        source_notion_url: "https://notion.so/p1",
      }),
    });
    expect(page?.title).toBe("From GitHub");
  });
});
