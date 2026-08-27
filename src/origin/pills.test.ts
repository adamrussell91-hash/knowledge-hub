import { describe, expect, it } from "vitest";
import { originComposeFieldHtml, originPillsHtml, parseOriginRemoveValue } from "./pills";

describe("origin pills", () => {
  it("renders kind + label pills and skips an empty row", () => {
    expect(originPillsHtml([])).toBe("");
    const html = originPillsHtml([{ kind: "unit", label: "EDST5805" }]);
    expect(html).toContain("origin-pill");
    expect(html).toContain("Unit");
    expect(html).toContain("EDST5805");
    expect(html).not.toContain("data-origin-remove");
  });

  it("lets the reader open a pill for editing", () => {
    const html = originPillsHtml([{ kind: "pd", label: "Research Conference 2026" }], { openEdit: true });
    expect(html).toContain('data-edit-origins="pd:Research Conference 2026"');
    expect(html).toContain("origin-pill__label");
  });

  it("adds a remove control in compose", () => {
    const html = originComposeFieldHtml([{ kind: "pd", label: "HALT workshop" }]);
    expect(html).toContain("compose-origins-label");
    expect(html).toContain("data-origin-remove=\"pd:HALT workshop\"");
    expect(html).toContain("compose-origin-kind");
    expect(html).toContain("Tap a pill to change it");
    expect(html).toContain("data-origin-edit");
    expect(html).toContain("compose-origin-suggestions");
  });

  it("lists known book titles on the origin field", () => {
    const html = originComposeFieldHtml([], null, ["Make It Stick", "Atomic Habits"]);
    expect(html).toContain('value="Make It Stick"');
    expect(html).toContain('value="Atomic Habits"');
  });

  it("parses a remove value back into an origin", () => {
    expect(parseOriginRemoveValue("notebook:Brown 2022")).toEqual({ kind: "notebook", label: "Brown 2022" });
    expect(parseOriginRemoveValue("nope")).toBeNull();
  });
});
