import { describe, expect, it } from "vitest";
import { normalizeManifestRow } from "./localData";

describe("normalizeManifestRow", () => {
  it("keeps created_at when the staged manifest has it", () => {
    expect(
      normalizeManifestRow({
        id: "p",
        title: "Title",
        area: "notes",
        tags: ["psychology"],
        excerpt: "Summary",
        origins: [{ kind: "unit", label: "EDST5805" }],
        path: "pages/p.json",
        created_at: "2024-06-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      id: "p",
      created_at: "2024-06-01T00:00:00.000Z",
      origins: [{ kind: "unit", label: "EDST5805" }],
    });
  });

  it("omits created_at when the staged row has none", () => {
    expect(
      normalizeManifestRow({
        id: "p",
        title: "Title",
        area: "notes",
        tags: [],
        excerpt: "Summary",
      }).created_at,
    ).toBeUndefined();
  });
});
