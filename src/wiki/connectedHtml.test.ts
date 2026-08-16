import { describe, expect, it } from "vitest";
import { connectedLinksHtml } from "./connectedHtml";

describe("connectedLinksHtml", () => {
  it("returns nothing when there are no connected ids", () => {
    expect(connectedLinksHtml({ connected: [] }, [{ id: "a", title: "A" }])).toBe("");
    expect(connectedLinksHtml({}, [{ id: "a", title: "A" }])).toBe("");
  });

  it("lists titles from the archive manifest and falls back to the id", () => {
    const html = connectedLinksHtml({ connected: ["a", "missing"] }, [{ id: "a", title: "Duty" }]);
    expect(html).toContain("Connected");
    expect(html).toContain("data-open-page=\"a\"");
    expect(html).toContain("Duty");
    expect(html).toContain("missing");
  });
});
