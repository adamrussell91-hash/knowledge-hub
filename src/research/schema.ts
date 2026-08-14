import { z } from "zod";

export const StanceSchema = z.enum(["supports", "complicates", "extends", "related"]);
export type Stance = z.infer<typeof StanceSchema>;

export const ResearchStatusSchema = z.enum(["running", "done", "error", "cancelled"]);
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>;

export const ResearchFindingSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  sourceUrl: z.string(),
  excerpt: z.string(),
  stance: StanceSchema,
  analysis: z.string(),
});
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

export const ResearchResultSchema = z.object({
  query: z.string(),
  round: z.number().int().nonnegative(),
  status: ResearchStatusSchema,
  findings: z.array(ResearchFindingSchema),
  gaps: z.array(z.string()),
  followUpQueries: z.array(z.string()),
  error: z.string().optional(),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

export function toResearchResult(input: ResearchResult): ResearchResult {
  return ResearchResultSchema.parse(input);
}
