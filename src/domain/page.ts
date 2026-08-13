import { z } from "zod";

export const AttachmentSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "pdf", "file"]),
  r2_key: z.string(),
  filename: z.string(),
  content_type: z.string(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const PageAreaSchema = z.enum(["university", "notes"]);
export type PageArea = z.infer<typeof PageAreaSchema>;

export const PageManifestEntrySchema = z.object({ id: z.string(), title: z.string(), area: PageAreaSchema, tags: z.array(z.string()), excerpt: z.string() });
export type PageManifestEntry = z.infer<typeof PageManifestEntrySchema>;

export const PageSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  area: PageAreaSchema,
  tags: z.array(z.string()),
  body: z.string(),
  attachments: z.array(AttachmentSchema),
  source_notion_id: z.string(),
  source_notion_url: z.string().url(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  schema_version: z.literal(1),
});

export type Page = z.infer<typeof PageSchema>;
