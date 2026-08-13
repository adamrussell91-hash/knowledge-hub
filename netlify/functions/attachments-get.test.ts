import { describe, expect, it } from "vitest";
import { findAttachment } from "./attachments-get";

describe("findAttachment", () => {
  it("selects an attachment only from its requested page", () => {
    const page = { attachments: [{ id: "a", r2_key: "university/a.pdf" }] };
    expect(findAttachment(page, "a")).toEqual({ id: "a", r2_key: "university/a.pdf" });
    expect(findAttachment(page, "missing")).toBeNull();
  });
});
