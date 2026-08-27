/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { protocolPillsHtml } from "./protocolPills";

describe("protocolPillsHtml", () => {
  it("renders Clementine protocol bubbles with hover cards", () => {
    const html = protocolPillsHtml("clementine", "synthesis");
    expect(html).toContain("Clementine can");
    expect(html).toContain("Thematic synthesis");
    expect(html).toContain('data-protocol="synthesis"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("audit trail");
  });

  it("renders Ann protocol bubbles", () => {
    const html = protocolPillsHtml("ann", null);
    expect(html).toContain("Ann can");
    expect(html).toContain("Close-read");
    expect(html).toContain('data-protocol="find-turn"');
    expect(html).toContain("Where's the turn?");
  });
});
