import { describe, expect, it } from "vitest";
import { originComposeFieldHtml, originPillsHtml, parseOriginRemoveValue } from "./pills";

describe("origin pills", () => {
  it("renders small kind + label pills and skips an empty row", () => {
    expect(originPillsHtml([])).toBe("");
    const html = originPillsHtml([{ kind: "unit", label: "EDST5805" }]);
    expect(html).toContain("origin-pill");
    expect(html).toContain("Unit");
    expect(html).toContain("EDST5805");
    expect(html).not.toContain("data-origin-remove");
  });

  it("adds a remove control in compose", () => {
    const html = originComposeFieldHtml([{ kind: "pd", label: "HALT workshop" }]);
    expect(html).toContain("compose-origins-label");
    expect(html).toContain("data-origin-remove=\"pd:HALT workshop\"");
    expect(html).toContain("compose-origin-kind");
  });

  it("parses a remove value back into an origin", () => {
    expect(parseOriginRemoveValue("notebook:Brown 2022")).toEqual({ kind: "notebook", label: "Brown 2022" });
    expect(parseOriginRemoveValue("nope")).toBeNull();
  });
});
