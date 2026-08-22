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

  it("resolves Book/Journal and PD relation titles", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes("15df794f-8476-80f7-ae79-f77b0001c400")) {
        return {
          ok: true,
          json: async () => ({
            properties: { Name: { type: "title", title: [{ plain_text: "Atomic Habits" }] } },
          }),
        };
      }
      if (href.includes("a13ca0bb-27e8-43e6-a14b-9112df62f740")) {
        return {
          ok: true,
          json: async () => ({
            properties: {
              Name: { type: "title", title: [{ plain_text: "The Wisdom Within — Week 2: Self-discovery and self-knowledge" }] },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          properties: {
            Notebooks: { type: "select", select: { name: "Cognitive Psychology" } },
            "Book/Journal": { type: "relation", relation: [{ id: "15df794f-8476-80f7-ae79-f77b0001c400" }] },
            "Professional Development Session": {
              type: "relation",
              relation: [{ id: "a13ca0bb-27e8-43e6-a14b-9112df62f740" }],
            },
          },
        }),
      };
    }) as unknown as typeof fetch;
    await expect(originsFromNotionPage("13ef794f84768078bbe7d30d66a8709c", "secret", fetchImpl)).resolves.toEqual([
      { kind: "book", label: "Atomic Habits" },
      { kind: "notebook", label: "Cognitive Psychology" },
      { kind: "pd", label: "The Wisdom Within — Week 2: Self-discovery and self-knowledge" },
    ]);
  });
});
