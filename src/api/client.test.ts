import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPage, listPages } from "./client";
import { API_BASE } from "./config";
describe("api client", () => { beforeEach(() => vi.restoreAllMocks()); it("lists pages", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "p" }] })); await expect(listPages()).resolves.toEqual([{ id: "p" }]); expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/pages"), expect.objectContaining({ credentials: "include" })); }); it("gets a page", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "p" }) })); await expect(getPage("p")).resolves.toEqual({ id: "p" }); }); });

it("uses the same-origin API route by default", () => expect(API_BASE).toBe("/api"));
