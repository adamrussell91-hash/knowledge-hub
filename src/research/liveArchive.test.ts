import { describe, expect, it } from "vitest";
import { docsFromManifest, researchFromDocs } from "./liveArchive";

const docs = docsFromManifest([
  {
    id: "page_attr",
    title: "Weiner attribution theory",
    excerpt: "Ability, effort, luck, and task difficulty in HPGE classrooms.",
    tags: ["psychology"],
  },
  {
    id: "page_other",
    title: "Attendance policy",
    excerpt: "Parent contact notes",
    tags: ["policy"],
  },
]);

describe("researchFromDocs", () => {
  it("returns live archive pages for a scoping question", () => {
    const result = researchFromDocs({
      query: "what do I have on attribution theory",
      docs,
      k: 8,
    });
    expect(result.findings[0]?.pageId).toBe("page_attr");
    expect(result.findings[0]?.title).toMatch(/attribution/i);
    expect(result.findings[0]?.tags).toEqual(["psychology"]);
    expect(result.status).toBe("done");
  });

  it("filters to required tags", () => {
    const methods = docsFromManifest(
      [
        { id: "page_attr", title: "Weiner", excerpt: "attribution", tags: ["psychology"] },
        {
          id: "page_method",
          title: "Attribution coding",
          excerpt: "How to code causal attributions",
          tags: ["Research Methods and Evidence Literacy"],
        },
      ],
      ["Research Methods and Evidence Literacy"],
    );
    const result = researchFromDocs({ query: "attribution", docs: methods, k: 8 });
    expect(result.findings.map(item => item.pageId)).toEqual(["page_method"]);
  });
});
