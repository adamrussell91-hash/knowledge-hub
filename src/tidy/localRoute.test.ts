import { describe, expect, it } from "vitest";
import { handleLocalTidyRoute } from "./localRoute";

describe("handleLocalTidyRoute", () => {
  it("ignores ordinary local-data file reads", async () => {
    await expect(
      handleLocalTidyRoute({ method: "GET", url: "/local-data/manifest.json", body: "", tidyPage: async () => ({ id: "p" } as never) }),
    ).resolves.toBeNull();
  });

  it("tidies a posted page id", async () => {
    const result = await handleLocalTidyRoute({
      method: "POST",
      url: "/local-data/tidy",
      body: JSON.stringify({ id: "page_hub_p" }),
      tidyPage: async id => ({ id, title: "Tidied" } as never),
    });
    expect(result).toEqual({ status: 200, json: { id: "page_hub_p", title: "Tidied" } });
  });

  it("requires an id", async () => {
    const result = await handleLocalTidyRoute({
      method: "POST",
      url: "/local-data/tidy",
      body: "{}",
      tidyPage: async () => ({ id: "p" } as never),
    });
    expect(result?.status).toBe(400);
  });
});
