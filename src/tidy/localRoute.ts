import type { Page } from "../domain/page";

export async function handleLocalTidyRoute(input: {
  method?: string;
  url?: string;
  body: string;
  tidyPage: (id: string) => Promise<Page>;
}): Promise<{ status: number; json: unknown } | null> {
  const pathName = (input.url ?? "").split("?")[0];
  if (pathName !== "/local-data/tidy") return null;
  if (input.method !== "POST") return { status: 405, json: { error: "Method not allowed" } };
  let id = "";
  try {
    const payload = JSON.parse(input.body || "{}") as { id?: unknown };
    id = typeof payload.id === "string" ? payload.id.trim() : "";
  } catch {
    return { status: 400, json: { error: "Invalid JSON" } };
  }
  if (!id) return { status: 400, json: { error: "id is required" } };
  try {
    return { status: 200, json: await input.tidyPage(id) };
  } catch (error) {
    return { status: 502, json: { error: error instanceof Error ? error.message : "Tidy failed" } };
  }
}
