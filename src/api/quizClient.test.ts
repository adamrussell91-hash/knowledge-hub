import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQuizItems, getQuizSchedule, saveQuiz } from "./quizClient";

describe("quiz client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the schedule from /quiz", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ schema_version: 1, schedule: [], edges: [], dumps: [] }),
      }),
    );
    await expect(getQuizSchedule()).resolves.toEqual({ schema_version: 1, schedule: [], edges: [], dumps: [] });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/quiz"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("loads items for a page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));
    await expect(getQuizItems("page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/quiz/items/page_hub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("posts a save payload to /quiz-save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ schema_version: 1, schedule: [], edges: [], dumps: [] }),
      }),
    );
    await saveQuiz({ schedule: [], items: [] });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/quiz-save"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });
});
