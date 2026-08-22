import { describe, expect, it } from "vitest";
import { handleChatWriteRequest } from "./writeHttp";

const secret = "kernel-secret";

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://kernel.test${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-research-kernel-secret": secret,
      ...(init.headers ?? {}),
    },
  });
}

describe("handleChatWriteRequest", () => {
  it("starts a write session without waiting for Anthropic", async () => {
    const response = await handleChatWriteRequest(
      request("/chat/write/start", {
        method: "POST",
        body: JSON.stringify({
          system: "voice",
          messages: [{ role: "user", content: "self determination theory" }],
        }),
      }),
      {
        secret,
        allowedOrigin: "*",
        startWrite: async () => ({ writeSessionId: "w1", status: "writing" }),
        getWrite: async () => null,
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ writeSessionId: "w1", status: "writing" });
  });

  it("polls a finished write", async () => {
    const response = await handleChatWriteRequest(request("/chat/write/w1"), {
      secret,
      allowedOrigin: "*",
      startWrite: async () => ({ writeSessionId: "w1", status: "writing" }),
      getWrite: async id => ({ writeSessionId: id, status: "done", reply: "Three clusters." }),
    });
    expect(await response.json()).toMatchObject({ status: "done", reply: "Three clusters." });
  });
});
