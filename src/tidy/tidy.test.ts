import { describe, expect, it } from "vitest";
import type { Page } from "../domain/page";
import { applyTidyProposal } from "./propose";

const caesar: Page = {
  id: "page_hub_caesar",
  title: "Caesar and the Roman Republic",
  area: "university",
  tags: ["Note", "HIST2001", "Educational Psychology", "Pedagogy"],
  origins: [{ kind: "unit", label: "HIST2001" }, { kind: "degree", label: "MEd" }],
  body: "# Caesar and the Roman Republic\n\n\n\nQ: Why did Caesar cross the Rubicon?\nA: It began a civil war.",
  connected: [], attachments: [], source: "hub",
  created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-10T00:00:00.000Z", schema_version: 1,
};

describe("Caesar tidy fixture", () => {
  it("replaces education-padded tags with Philosophy Knowledge and Society while retaining Note and the unit code", () => {
    const tidied = applyTidyProposal(caesar, {
      tags: ["philosophy knowledge and society", "history", "classics"],
      title: null,
      body: "Q: Why did Caesar cross the Rubicon?\nA: It began a civil war.\n\n\n\nContext follows.",
    });
    expect(tidied.tags).toEqual(["Note", "HIST2001", "Philosophy Knowledge and Society"]);
    expect(tidied.origins).toEqual([
      { kind: "unit", label: "HIST2001" },
      { kind: "degree", label: "MEd" },
    ]);
    expect(tidied.body).toContain("Q: Why did Caesar cross the Rubicon?\nA: It began a civil war.");
    expect(tidied.body).not.toContain("\n\n\n");
  });
});
