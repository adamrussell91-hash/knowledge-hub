import { describe, expect, it } from "vitest";
import { newFsrsCard } from "./schema";
import { deriveStatus } from "./status";

describe("deriveStatus", () => {
  it("is untested when never reviewed", () => {
    expect(deriveStatus(newFsrsCard())).toBe("untested");
  });

  it("is failed while relearning or after Again", () => {
    expect(deriveStatus({ ...newFsrsCard(), reps: 3, lapses: 1, state: 3 })).toBe("failed");
    expect(deriveStatus({ ...newFsrsCard(), reps: 2, state: 2, scheduled_days: 10 }, 1)).toBe("failed");
  });

  it("is decaying when due in the past after at least one success", () => {
    const due = new Date(Date.now() - 86400000).toISOString();
    expect(
      deriveStatus({ ...newFsrsCard(), reps: 2, state: 2, scheduled_days: 10, due }, 3),
    ).toBe("decaying");
  });

  it("is verified only after repeated success with a week-plus interval", () => {
    const due = new Date(Date.now() + 86400000).toISOString();
    expect(
      deriveStatus({ ...newFsrsCard(), reps: 1, state: 2, scheduled_days: 3, due }, 3),
    ).toBe("untested");
    expect(
      deriveStatus({ ...newFsrsCard(), reps: 2, state: 2, scheduled_days: 21, due }, 4),
    ).toBe("verified");
  });
});
