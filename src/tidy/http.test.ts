import { describe, expect, it, vi } from "vitest";
import { signSession } from "../../netlify/functions/_lib/session";
import { handleTidyRequest, KNOWLEDGE_HUB_ORIGIN } from "./http";
import type { Page } from "../domain/page";

const secret = "session-secret";
const hub = KNOWLEDGE_HUB_ORIGIN;
const page = { id: "page_hub_p", title: "Tidied" } as Page;

function request(init: { origin?: string | null; cookie?: string; method?: string; body?: string; kernel?: string }) {
  const headers = new Headers();
  if (init.origin !== null) headers.set("Origin", init.origin ?? hub);
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (init.kernel) headers.set("x-research-kernel-secret", init.kernel);
  return new Request("https://knowledge-tidy.adam-russell.com/tidy", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "OPTIONS" ? undefined : (init.body ?? JSON.stringify({ id: "page_hub_p" })),
  });
}

function bindings(tidyPage = vi.fn(async () => page)) {
  return { sessionSecret: secret, allowedOrigin: hub, tidyPage };
}

describe("handleTidyRequest", () => {
  it("answers CORS preflight with credentials for the Knowledge Hub origin only", async () => {
    const response = await handleTidyRequest(request({ method: "OPTIONS" }), bindings());
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(hub);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });

  it("rejects a Teaching Hub origin", async () => {
    const response = await handleTidyRequest(
      request({ origin: "https://teaching-hub.adam-russell.com" }),
      bindings(),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Origin not allowed" });
  });

  it("rejects a missing or invalid session cookie", async () => {
    const missing = await handleTidyRequest(request({}), bindings());
    expect(missing.status).toBe(401);
    const bad = await handleTidyRequest(request({ cookie: "kh_session=nope" }), bindings());
    expect(bad.status).toBe(401);
  });

  it("tidies the posted id after a valid session and returns the page", async () => {
    const token = signSession({ sub: "single-user" }, secret);
    const tidyPage = vi.fn(async (id: string) => {
      expect(id).toBe("page_hub_p");
      return page;
    });
    const response = await handleTidyRequest(request({ cookie: `kh_session=${token}` }), bindings(tidyPage));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    await expect(response.json()).resolves.toMatchObject({ id: "page_hub_p" });
    expect(tidyPage).toHaveBeenCalledWith("page_hub_p");
  });

  it("accepts a kernel secret and returns 202 so the caller is not blocked on Claude", async () => {
    const waitUntil = vi.fn();
    const tidyPage = vi.fn(async () => page);
    const response = await handleTidyRequest(
      request({ origin: null, kernel: "kernel-secret" }),
      { ...bindings(tidyPage), kernelSecret: "kernel-secret", waitUntil },
    );
    expect(response.status).toBe(202);
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]?.[0];
    expect(tidyPage).toHaveBeenCalledWith("page_hub_p");
  });
});
