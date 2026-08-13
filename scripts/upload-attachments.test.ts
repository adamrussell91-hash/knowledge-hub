import { describe, expect, it } from "vitest";
import { uniqueAttachments } from "./upload-attachments";

describe("uniqueAttachments", () => {
  it("deduplicates attachments that share an R2 key", () => {
    expect(uniqueAttachments([{ r2_key: "a", source_path: "a" }, { r2_key: "a", source_path: "a" }, { r2_key: "b", source_path: "b" }])).toEqual([{ r2_key: "a", source_path: "a" }, { r2_key: "b", source_path: "b" }]);
  });
});
