import { describe, expect, it } from "vitest";
import { excerptFromBody, fetchPageBody, normalizePageBody, SYNTHESIS_EXCERPT_CHARS } from "./fetchPageBody";

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

describe("normalizePageBody", () => {
  it("keeps topic tags from a full page record", () => {
    expect(
      normalizePageBody({
        id: "p1",
        title: "SDT",
        body: "Need satisfaction",
        source_notion_url: "https://notion.so/p1",
        tags: ["Motivation and Self Regulation", ""],
      })?.tags,
    ).toEqual(["Motivation and Self Regulation"]);
  });

  it("rejects a record without an id", () => {
    expect(normalizePageBody({ title: "No id" })).toBeNull();
  });
});

describe("excerptFromBody", () => {
  it("can keep a longer synthesis excerpt than the lexical snippet", () => {
    const body = "x".repeat(1200);
    expect(excerptFromBody(body).length).toBe(300);
    expect(excerptFromBody(body, SYNTHESIS_EXCERPT_CHARS).length).toBe(900);
  });
});
