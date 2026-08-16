import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handler } from "./attachments-sign";
import { signSession } from "./_lib/session";
import { MAX_ATTACHMENT_BYTES } from "./_lib/attachmentSign";

const secret = "session-secret";
const body = JSON.stringify({
  filename: "a.pdf",
  content_type: "application/pdf",
  byte_size: 10,
  page_id: "page_hub_aa",
  area: "notes",
});

function event(overrides: { cookie?: boolean; body?: string } = {}) {
  const token = signSession({ sub: "adam" }, secret);
  return {
    httpMethod: "POST",
    headers: overrides.cookie === false ? {} : { cookie: `kh_session=${token}` },
    body: overrides.body ?? body,
  };
}

describe("attachments-sign", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = secret;
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_BUCKET;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
  });

  it("requires a session", async () => {
    const response = await handler(event({ cookie: false }) as never, {} as never);
    expect(response.statusCode).toBe(401);
  });

  it("rejects oversize files", async () => {
    const response = await handler(
      event({
        body: JSON.stringify({
          filename: "a.pdf",
          content_type: "application/pdf",
          byte_size: MAX_ATTACHMENT_BYTES + 1,
          page_id: "page_hub_aa",
          area: "notes",
        }),
      }) as never,
      {} as never,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatch(/20MB/i);
  });

  it("returns 503 when R2 is not configured", async () => {
    const response = await handler(event() as never, {} as never);
    expect(response.statusCode).toBe(503);
  });
});
