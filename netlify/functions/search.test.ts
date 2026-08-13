import { describe, expect, it } from "vitest";
import { rankByQuery } from "./search";
const pages = [{ id: "1", title: "Stoicism", area: "notes" as const, tags: ["philosophy"], excerpt: "CBT" }, { id: "2", title: "Entropy", area: "university" as const, tags: ["physics"], excerpt: "heat" }];
describe("rankByQuery", () => { it("finds title, tag, and excerpt matches", () => { expect(rankByQuery(pages, "stoicism").map(p => p.id)).toEqual(["1"]); expect(rankByQuery(pages, "physics").map(p => p.id)).toEqual(["2"]); expect(rankByQuery(pages, "CBT").map(p => p.id)).toEqual(["1"]); }); });
