import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookContextLine,
  bookOrigin,
  normalizeBookContext,
  resolveBookLabel,
  scoreBookFinding,
  selectBestFindings,
} from "./bookNote";
import { bookNoteProtocol } from "./bookNoteProtocol";
import type { ResearchFinding } from "../research/schema";

function finding(overrides: Partial<ResearchFinding> = {}): ResearchFinding {
  return {
    pageId: "page_hub_1",
    title: "Desirable difficulties",
    sourceUrl: "https://example.test/p1",
    excerpt: "Retrieval that costs effort sticks.",
    stance: "supports",
    analysis: "Supports the book's claim.",
    ...overrides,
  };
}

describe("from a book protocol helpers", () => {
  it("normalises a book label and optional passage", () => {
    expect(normalizeBookContext({ label: "  Make It Stick  ", locus: " p. 142  " })).toEqual({
      label: "Make It Stick",
      locus: "p. 142",
    });
    expect(normalizeBookContext({ label: "   " })).toBeUndefined();
    expect(bookContextLine({ label: "Make It Stick", locus: "p. 142" })).toBe(
      "Reading: Make It Stick (p. 142)",
    );
    expect(bookOrigin({ label: "Make It Stick" })).toEqual({ kind: "book", label: "Make It Stick" });
    expect(resolveBookLabel("Make It StickMake", ["Make It Stick", "Atomic Habits"])).toBe("Make It Stick");
    expect(resolveBookLabel("a new memoir", ["Make It Stick"])).toBe("a new memoir");
  });

  it("keeps only the strongest notes and drops thin related hits", () => {
    const best = selectBestFindings([
      finding({
        pageId: "weak",
        title: "A nearby anecdote",
        stance: "related",
        confidence: "low",
        claimRelationship: "interpretive",
      }),
      finding({
        pageId: "strong",
        title: "Bjork on retrieval effort",
        stance: "supports",
        confidence: "high",
        claimRelationship: "direct",
      }),
      finding({
        pageId: "complicates",
        title: "When difficulty is just load",
        stance: "complicates",
        confidence: "medium",
        claimRelationship: "direct",
      }),
      finding({
        pageId: "also-weak",
        title: "A syllabus mention",
        stance: "related",
        confidence: "low",
      }),
    ]);
    expect(best.map(item => item.pageId)).toEqual(["strong", "complicates"]);
    expect(scoreBookFinding(best[0]!)).toBeGreaterThan(scoreBookFinding(best[1]!));
    expect(
      selectBestFindings([
        finding({
          pageId: "only-strong",
          title: "Bjork on retrieval effort",
          stance: "supports",
          confidence: "high",
          claimRelationship: "direct",
        }),
        finding({
          pageId: "noise",
          title: "A nearby anecdote",
          stance: "related",
          confidence: "low",
        }),
      ]).map(item => item.pageId),
    ).toEqual(["only-strong"]);
  });

  it("ships a phone-first information-page protocol that turns back to the book", () => {
    const protocol = bookNoteProtocol();
    const onDisk = readFileSync(join(process.cwd(), "prompts/clementine-book-note.md"), "utf8");
    expect(protocol).toBe(onDisk);
    expect(protocol).toMatch(/From a book protocol/);
    expect(protocol).toMatch(/How this bears on the book/);
    expect(protocol).toMatch(/Search the open web/i);
    expect(protocol).toMatch(/Do not dig the archive/i);
    expect(protocol).not.toMatch(/Theme evidence matrix/);
    expect(protocol).toMatch(/Do not run Reverse Outline/);
  });
});
