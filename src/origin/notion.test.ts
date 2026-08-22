import { describe, expect, it, vi } from "vitest";
import { originsFromNotionPage } from "./notion";

describe("originsFromNotionPage", () => {
  it("requests the dashed page id and maps properties", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        properties: {
          Degree: { type: "select", select: { name: "MEd" } },
          Unit: { type: "select", select: { name: "EDGL909" } },
        },
      }),
    })) as unknown as typeof fetch;
    await expect(originsFromNotionPage("13ef794f84768078bbe7d30d66a8709c", "secret", fetchImpl)).resolves.toEqual([
      { kind: "degree", label: "MEd" },
      { kind: "unit", label: "EDGL909" },
    ]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("13ef794f-8476-8078-bbe7-d30d66a8709c");
  });

  it("returns null when Notion rejects the page", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(originsFromNotionPage("13ef794f84768078bbe7d30d66a8709c", "secret", fetchImpl)).resolves.toBeNull();
  });
});
