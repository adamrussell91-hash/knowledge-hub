import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKind,
  hubR2Key,
  parseSignRequest,
  uniqueFilename,
} from "./attachmentSign";

describe("attachmentSign helpers", () => {
  it("rejects oversize files", () => {
    expect(
      parseSignRequest({
        filename: "a.pdf",
        content_type: "application/pdf",
        byte_size: MAX_ATTACHMENT_BYTES + 1,
        page_id: "page_hub_aa",
        area: "notes",
      }).error,
    ).toMatch(/20MB/i);
  });

  it("builds notes and university keys", () => {
    expect(hubR2Key("notes", "page_hub_aa", "Slide Deck.pdf")).toBe("notes/page_hub_aa/Slide_Deck.pdf");
    expect(hubR2Key("university", "page_hub_aa", "a.pdf")).toBe("university/page_hub_aa/a.pdf");
  });

  it("maps kinds", () => {
    expect(attachmentKind("application/pdf", "x.pdf")).toBe("pdf");
    expect(attachmentKind("image/png", "x.png")).toBe("image");
    expect(attachmentKind("application/octet-stream", "x.bin")).toBe("file");
    expect(attachmentKind("audio/webm", "voice.webm")).toBe("audio");
  });

  it("signs audio captures", () => {
    const parsed = parseSignRequest({
      filename: "voice.webm",
      content_type: "audio/webm",
      byte_size: 12,
      page_id: "page_hub_aa",
      area: "notes",
    });
    expect(parsed.value?.attachment.kind).toBe("audio");
    expect(parsed.value?.attachment.r2_key).toBe("notes/page_hub_aa/voice.webm");
  });

  it("uniquifies duplicate names", () => {
    expect(uniqueFilename("a.pdf", 1)).toBe("a-1.pdf");
  });
});
