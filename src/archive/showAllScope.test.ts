import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import {
  filterShowAllEntries,
  hubLabelsFor,
  isNotebookNote,
  isUniversityNote,
  showAllGroupingMeta,
} from "./showAllScope";

const V = TOPIC_VOCABULARY;

function page(
  id: string,
  partial: Partial<{
    title: string;
    area: "notes" | "university";
    tags: string[];
    origins: { kind: "degree" | "unit" | "notebook" | "book" | "pd"; label: string }[];
  }> = {},
) {
  return {
    id,
    title: partial.title ?? id,
    area: partial.area ?? "notes",
    tags: partial.tags ?? [V[0]],
    excerpt: "",
    origins: partial.origins,
  };
}

describe("show all grouping scope", () => {
  it("treats area or degree/unit origins as university notes", () => {
    expect(isUniversityNote(page("u1", { area: "university", origins: [] }))).toBe(true);
    expect(isUniversityNote(page("u2", { origins: [{ kind: "unit", label: "EDST5805" }] }))).toBe(true);
    expect(isUniversityNote(page("n1", { origins: [{ kind: "notebook", label: "Brown 2022" }] }))).toBe(false);
  });

  it("keeps notebook notes out of the university bucket", () => {
    const notebook = page("nb", { origins: [{ kind: "notebook", label: "Cognitive Psychology" }] });
    expect(isNotebookNote(notebook)).toBe(true);
    expect(isUniversityNote(notebook)).toBe(false);
  });

  it("hides university notes from the notebooks view and notebook notes from degrees", () => {
    const uni = page("uni", {
      area: "university",
      origins: [
        { kind: "degree", label: "Master of Education (Gifted Education)" },
        { kind: "notebook", label: "Should not appear in notebooks" },
      ],
    });
    const notebook = page("nb", { origins: [{ kind: "notebook", label: "Cognitive Psychology" }] });
    const tagged = page("tag", { tags: [V[2]] });

    expect(filterShowAllEntries([uni, notebook, tagged], "tags").map(item => item.id)).toEqual([
      "uni",
      "nb",
      "tag",
    ]);
    expect(filterShowAllEntries([uni, notebook, tagged], "notebooks").map(item => item.id)).toEqual(["nb"]);
    expect(filterShowAllEntries([uni, notebook, tagged], "degrees").map(item => item.id)).toEqual(["uni"]);
  });

  it("groups degrees from the unit map and notebooks from notebook pills", () => {
    const uni = page("uni", { origins: [{ kind: "unit", label: "EDST5805" }] });
    const notebook = page("nb", { origins: [{ kind: "notebook", label: "Brown 2022" }] });
    expect(hubLabelsFor(uni, "degrees")).toEqual(["Master of Education (Gifted Education)"]);
    expect(hubLabelsFor(notebook, "notebooks")).toEqual(["Brown 2022"]);
    expect(hubLabelsFor(notebook, "tags")).toEqual([V[0]]);
  });

  it("names the exclusive views in the toolbar copy", () => {
    expect(showAllGroupingMeta("notebooks")).toContain("university notes hidden");
    expect(showAllGroupingMeta("degrees")).toContain("notebook notes hidden");
    expect(showAllGroupingMeta("tags")).toContain("each colour is a topic");
  });
});
