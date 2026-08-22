import { z } from "zod";

export const AttachmentSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "pdf", "file", "audio"]),
  r2_key: z.string(),
  filename: z.string(),
  label: z.string().optional(),
  content_type: z.string(),
  source_path: z.string().optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const PageAreaSchema = z.enum(["university", "notes"]);
export type PageArea = z.infer<typeof PageAreaSchema>;

export const ORIGIN_KINDS = ["degree", "unit", "notebook", "book", "pd"] as const;
export const OriginKindSchema = z.enum(ORIGIN_KINDS);
export type OriginKind = z.infer<typeof OriginKindSchema>;

export const OriginSchema = z.object({
  kind: OriginKindSchema,
  label: z.string().min(1),
});
export type Origin = z.infer<typeof OriginSchema>;

export const PageManifestEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  area: PageAreaSchema,
  tags: z.array(z.string()),
  excerpt: z.string(),
  origins: z.array(OriginSchema).optional(),
  source_notion_id: z.string().optional(),
  created_at: z.string().datetime().optional(),
});
export type PageManifestEntry = z.infer<typeof PageManifestEntrySchema>;

export const PageSchema = z
  .object({
    id: z.string(),
    title: z.string().min(1),
    area: PageAreaSchema,
    tags: z.array(z.string()),
    origins: z.array(OriginSchema).optional(),
    body: z.string(),
    connected: z.array(z.string()).default([]),
    attachments: z.array(AttachmentSchema),
    source: z.enum(["hub", "notion"]).optional(),
    source_notion_id: z.string().optional(),
    source_notion_url: z.string().url().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    schema_version: z.literal(1),
  })
  .superRefine((page, ctx) => {
    if (page.source === "hub") return;
    if (!page.source_notion_id) {
      ctx.addIssue({ code: "custom", message: "source_notion_id required", path: ["source_notion_id"] });
    }
    if (!page.source_notion_url) {
      ctx.addIssue({ code: "custom", message: "source_notion_url required", path: ["source_notion_url"] });
    }
  });

export type Page = z.infer<typeof PageSchema>;

export function newHubPageId(randomUUID: () => string = () => crypto.randomUUID()) {
  return `page_hub_${randomUUID().replace(/-/g, "").toLowerCase()}`;
}

export function parseTagList(raw: string) {
  return [...new Set(raw.split(",").map(part => part.trim()).filter(Boolean))];
}
