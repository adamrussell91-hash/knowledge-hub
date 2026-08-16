import { describe, expect, it } from "vitest";
import { applyPodcastScope, connectorScope, filterByUpdatedAt, recapCutoff, selectQuery } from "./select";

describe("podcast select", () => {
  it("builds a recap query from tags", () => {
    expect(selectQuery({ mode: "recap", scope: { tags: ["sdt"] }, modeDial: {} })).toContain("sdt");
  });

  it("ors connector clusters", () => {
    expect(connectorScope(["sdt", "dmgt"])).toEqual({ tags: ["sdt", "dmgt"], tagMatch: "any" });
  });

  it("uses the later of cadence window and last recap", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const weekly = recapCutoff({ cadence: "weekly", lastRecapAt: "2026-08-01T00:00:00.000Z", now });
    expect(weekly).toBe(Date.parse("2026-08-08T00:00:00.000Z"));
    const recent = recapCutoff({ cadence: "weekly", lastRecapAt: "2026-08-14T00:00:00.000Z", now });
    expect(recent).toBe(Date.parse("2026-08-14T00:00:00.000Z"));
  });

  it("requires every tag by default", () => {
    const docs = [
      { id: "a", tags: ["sdt", "motivation"] },
      { id: "b", tags: ["sdt"] },
    ];
    expect(applyPodcastScope(docs, { tags: ["sdt", "motivation"] })).toEqual([docs[0]]);
  });

  it("matches any tag when tagMatch is any", () => {
    const docs = [
      { id: "a", tags: ["sdt"] },
      { id: "b", tags: ["dmgt"] },
      { id: "c", tags: ["other"] },
    ];
    expect(applyPodcastScope(docs, { tags: ["sdt", "dmgt"], tagMatch: "any" })).toEqual([docs[0], docs[1]]);
  });

  it("keeps pages updated on or after cutoff", () => {
    const pages = [
      { id: "old", updated_at: "2026-08-01T00:00:00.000Z" },
      { id: "new", updated_at: "2026-08-14T00:00:00.000Z" },
    ];
    const cutoff = Date.parse("2026-08-08T00:00:00.000Z");
    expect(filterByUpdatedAt(pages, cutoff)).toEqual([pages[1]]);
  });
});
