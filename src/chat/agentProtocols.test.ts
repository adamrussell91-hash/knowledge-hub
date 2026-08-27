import { describe, expect, it } from "vitest";
import { AGENT_PROTOCOLS, findProtocol, normalizeProtocolId, protocolHat, protocolSteerBlock, protocolsForPersonality } from "./agentProtocols";
import { CHAT_HATS } from "./hats";

describe("agentProtocols", () => {
  it("maps Clementine pills to every chat hat", () => {
    const pack = protocolsForPersonality("clementine");
    expect(pack?.eyebrow).toBe("Clementine can");
    expect(pack?.pills.map(pill => pill.id)).toEqual(CHAT_HATS.map(hat => hat.id));
    for (const pill of pack?.pills ?? []) {
      expect(pill.explain).toMatch(/^[A-Z][^.?!]*[.?!]$/);
      expect(pill.hat).toBe(pill.id);
    }
  });

  it("ships Ann close-reading protocol pills", () => {
    expect(AGENT_PROTOCOLS.ann.pills.map(pill => pill.label)).toEqual([
      "Close-read",
      "Where's the turn?",
      "Read the pacing",
      "Annotate this",
      "Subtext read",
    ]);
  });

  it("builds a steer block without naming the system", () => {
    const block = protocolSteerBlock("clementine", "evidence");
    expect(block).toContain('"Evidence check" protocol');
    expect(block).toMatch(/do not narrate routing/i);
    expect(findProtocol("ann", "annotate")?.steer).toMatch(/annotation protocol/i);
  });

  it("resolves the hat from a selected protocol", () => {
    expect(protocolHat("clementine", "methods")).toBe("methods");
    expect(protocolHat("ann", "close-read")).toBe("synthesis");
    expect(protocolHat("clementine", null)).toBe("synthesis");
  });

  it("keeps camelCase hat protocol ids", () => {
    expect(normalizeProtocolId("fromBook")).toBe("fromBook");
    expect(normalizeProtocolId("internalExternal")).toBe("internalExternal");
    expect(normalizeProtocolId("close-read")).toBe("close-read");
    expect(normalizeProtocolId("not a protocol")).toBeUndefined();
  });
});
